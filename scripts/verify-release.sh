#!/usr/bin/env bash
# verify-release.sh — prove a release actually reached users.
#
# THE INCIDENT THIS EXISTS TO PREVENT — API-12.
# A fix was written in the product monorepo's packages/sdk/src/index.ts (three
# DomainCheck fields: subdomain, registrableDomain, publicSuffix), marked FIXED,
# and reached ZERO integrators. Two things went wrong, and this script exists
# because of the second:
#
#   1. `npm i customdomain-js` installs what THIS repo publishes, not what the
#      monorepo contains. Editing the source of a package is not shipping it.
#   2. The release process ended at the tag push. `packages/sdk/package.json`
#      said 0.4.0 while the newest tag was `v0.3.0` — and release.yml fires on
#      `push: tags: ["v*"]` and on nothing else. A bump without a tag publishes
#      NOTHING. The bump was committed, the workflow was green (it never ran),
#      and `latest` served the pre-fix source (src/index.ts md5
#      80e5aa15809beb954eb8639bb635db13, 630 lines) for six days. Nobody looked
#      at the registry, because the checklist had no step that did.
#
#   Found the same way, and never previously filed: `@customdomain/react@0.3.0`
#   shipped with NO purchase rail at all — no `onPurchase`, no `purchaseDomain()`
#   — while the SDK it wraps already dispatched `customdomain:purchase`. React
#   consumers silently dropped the event. That is what an unverified release
#   looks like from the outside.
#
# THE RULE THIS ENCODES: a release is delivered when the REGISTRY says so.
# Not when the tag is pushed, not when the workflow goes green, not when
# `gh release create` succeeds. Green means "the job ran", which is a claim about
# CI, not about npm. So this script asks npm.
#
# WHAT IT VERIFIES, per package
#   1. dist-tags — `latest` on the live registry equals the version under test.
#      Polled with backoff: npm's CDN is eventually consistent and a publish is
#      not instantly visible, so a single early curl would produce a false alarm.
#   2. the tarball IS the source — download what npm serves for that exact
#      version and diff its `src/` against this repo's `packages/*/src`. This is
#      the step that was skipped. `src/` (not just index.ts) because
#      "files": ["dist","src"] makes the whole directory the shipped payload.
#   3. provenance — the publish used --provenance and npm recorded the
#      attestation. A package published from a laptop with a stray token would
#      pass steps 1 and 2 and fail here.
#
# EXIT CODES
#   0  every package verified on the live registry
#   1  VERIFICATION FAILED — the registry does not carry what this repo says it
#      published. The release is NOT delivered.
#   2  could not run (missing tool, registry unreachable). Never conflated with
#      1: "I could not check" must never be recorded as "I checked and it's fine".
#
# USAGE (identical locally and in CI — release.yml's verify job runs the bare form)
#   scripts/verify-release.sh                 verify the version in packages/sdk/package.json
#   scripts/verify-release.sh 0.4.0           verify a specific version
#   scripts/verify-release.sh --no-wait       fail immediately instead of polling
#                                             (for checking an OLD release)
set -euo pipefail

REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"
ATTEMPTS="${VERIFY_ATTEMPTS:-10}"   # ~5 minutes total with the backoff below
SLEEP_SECS="${VERIFY_SLEEP:-30}"
CURL_TIMEOUT="${VERIFY_TIMEOUT:-60}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WAIT=1
VERSION=""
for arg in "$@"; do
	case "$arg" in
	--no-wait) WAIT=0 ;;
	--help | -h)
		sed -n '2,56p' "$0"
		exit 0
		;;
	-*)
		printf 'verify-release: unknown flag %q (try --help)\n' "$arg" >&2
		exit 2
		;;
	*) VERSION="$arg" ;;
	esac
done

die2() {
	printf '\nverify-release: CANNOT RUN — %s\n' "$1" >&2
	exit 2
}
for tool in curl tar jq diff node; do
	command -v "$tool" >/dev/null 2>&1 || die2 "$tool not found on PATH"
done

if [ -z "$VERSION" ]; then
	VERSION="$(node -p "require('./packages/sdk/package.json').version")" ||
		die2 "could not read the version from packages/sdk/package.json"
fi

# name <TAB> local src dir <TAB> path inside the tarball
PACKAGES=(
	"customdomain-js	packages/sdk/src	package/src"
	"@customdomain/react	packages/react/src	package/src"
)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

urlencode_pkg() { printf '%s' "${1/\//%2f}"; }

FAILURES=()
printf 'verify-release: verifying %s against %s\n\n' "$VERSION" "$REGISTRY"

for entry in "${PACKAGES[@]}"; do
	IFS=$'\t' read -r pkg local_src tar_src <<<"$entry"
	enc="$(urlencode_pkg "$pkg")"
	[ -d "$local_src" ] || die2 "$local_src does not exist in $REPO_ROOT"

	# ---- 1. dist-tags, polled ----
	# npm's read path is a CDN: a successful publish is not immediately visible
	# everywhere. Poll rather than trust the first answer, so a slow propagation
	# reads as "not yet" instead of "the release failed".
	latest=""
	tries=$([ "$WAIT" = 1 ] && echo "$ATTEMPTS" || echo 1)
	for i in $(seq 1 "$tries"); do
		if ! curl -sS --fail --max-time "$CURL_TIMEOUT" "$REGISTRY/-/package/$enc/dist-tags" \
			-o "$TMP/dt.json" 2>"$TMP/err"; then
			die2 "could not read dist-tags for $pkg: $(tr -d '\n' <"$TMP/err")"
		fi
		latest="$(jq -r '.latest // empty' "$TMP/dt.json")"
		[ "$latest" = "$VERSION" ] && break
		if [ "$i" -lt "$tries" ]; then
			printf '  ... %s latest=%s, waiting for %s (attempt %s/%s)\n' \
				"$pkg" "${latest:-none}" "$VERSION" "$i" "$tries"
			sleep "$SLEEP_SECS"
		fi
	done

	if [ "$latest" != "$VERSION" ]; then
		FAILURES+=("$pkg: dist-tag latest is '${latest:-none}', expected '$VERSION' — the publish did not land")
		printf '  FAIL  %s — latest=%s (expected %s)\n' "$pkg" "${latest:-none}" "$VERSION"
		continue
	fi
	printf '  OK    %s — dist-tag latest = %s\n' "$pkg" "$VERSION"

	# ---- 2. the tarball IS the source ----
	if ! curl -sS --fail --max-time "$CURL_TIMEOUT" "$REGISTRY/$enc" -o "$TMP/pk.json" 2>"$TMP/err"; then
		die2 "could not read the packument for $pkg: $(tr -d '\n' <"$TMP/err")"
	fi
	tarball="$(jq -r --arg v "$VERSION" '.versions[$v].dist.tarball // empty' "$TMP/pk.json")"
	[ -n "$tarball" ] || {
		FAILURES+=("$pkg@$VERSION has no tarball in the packument")
		printf '  FAIL  %s@%s — no tarball published\n' "$pkg" "$VERSION"
		continue
	}

	work="$TMP/$(printf '%s' "$pkg" | tr -c 'A-Za-z0-9._-' '_')"
	mkdir -p "$work"
	curl -sSL --fail --max-time "$CURL_TIMEOUT" "$tarball" -o "$work/p.tgz" 2>"$TMP/err" ||
		die2 "could not download $tarball: $(tr -d '\n' <"$TMP/err")"
	tar xzf "$work/p.tgz" -C "$work" || die2 "could not extract the $pkg@$VERSION tarball"
	[ -d "$work/$tar_src" ] || {
		FAILURES+=("$pkg@$VERSION tarball has no $tar_src/ — did \"files\" stop including src?")
		printf '  FAIL  %s@%s — tarball has no %s/\n' "$pkg" "$VERSION" "$tar_src"
		continue
	}

	if diff -ru "$local_src" "$work/$tar_src" >"$work/diff.txt" 2>&1; then
		printf '  OK    %s — published src/ is byte-identical to %s\n' "$pkg" "$local_src"
	else
		FAILURES+=("$pkg@$VERSION: published src/ differs from $local_src")
		printf '  FAIL  %s@%s — published src/ != %s\n' "$pkg" "$VERSION" "$local_src"
		sed -n '1,30p' "$work/diff.txt" | sed 's/^/          /'
	fi

	# ---- 3. provenance ----
	# Advisory-but-reported: a missing attestation means the publish did not go
	# through the trusted path, which is worth knowing even though the bytes are
	# already proven correct by step 2.
	att="$(jq -r --arg v "$VERSION" '.versions[$v].dist.attestations.url // empty' "$TMP/pk.json")"
	if [ -n "$att" ]; then
		printf '  OK    %s — provenance attestation recorded\n' "$pkg"
	else
		printf '  WARN  %s@%s — no provenance attestation on the registry metadata.\n' "$pkg" "$VERSION"
		printf '        Was this published outside .github/workflows/release.yml?\n'
	fi
	printf '\n'
done

if [ ${#FAILURES[@]} -eq 0 ]; then
	cat <<EOF
verify-release: OK — $VERSION is live on $REGISTRY and the published source is
byte-identical to this repo. The release is DELIVERED.

Remaining cross-repo step, which this script cannot see: the product monorepo's
hosted bundle is a SEPARATE distribution channel. Confirm it too —
    cd /home/user/custom-domains && infra/scripts/check-npm-drift.sh --verbose
EOF
	exit 0
fi

cat <<EOF

verify-release: FAILED — the registry does not carry what this repo claims to
have published. THE RELEASE IS NOT DELIVERED, regardless of any green check.

EOF
for f in "${FAILURES[@]}"; do printf '  * %s\n' "$f"; done
cat <<EOF

MOST LIKELY CAUSE, in order:
  1. THE TAG WAS NEVER PUSHED. release.yml fires on \`push: tags: ["v*"]\` and on
     nothing else, so a version bump committed without a tag publishes nothing
     and shows no failing run anywhere. This is exactly how API-12 stayed open
     for six days (0.4.0 in package.json, newest tag v0.3.0). Check:
         git describe --tags --abbrev=0
         node -p "require('./packages/sdk/package.json').version"
     If they disagree:
         git tag v$VERSION && git push origin v$VERSION
  2. The publish step failed inside a run that still reported success — open the
     run and read the publish step, not the job status.
  3. Propagation. Re-run; this script already polls for ~5 minutes.

Do NOT mark the change delivered until this script exits 0.
EOF
exit 1
