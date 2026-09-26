#!/usr/bin/env bash
# release-notes.sh: print the GitHub release notes for a version, from CHANGELOG.md.
#
# Every release in this repo reads the same way: the npm links, the CHANGELOG.md
# section for that version, and links to the full changelog and the diff.
# release.yml runs this before `gh release create`; run it locally to preview.
#
# USAGE
#   scripts/release-notes.sh           notes for the version in packages/sdk/package.json
#   scripts/release-notes.sh 0.5.0     notes for a specific version
#
# EXIT CODES
#   0  notes printed on stdout
#   1  CHANGELOG.md has no "## [X.Y.Z]" section for the version (release.yml then
#      falls back to notes generated from commits and pull requests)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="${1:-$(node -p "require('./packages/sdk/package.json').version")}"
REPO_URL="https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk"

# The section body: every line after the "## [X.Y.Z]" heading up to the next
# "## " heading, minus the "---" rules between sections, with leading and
# trailing blank lines removed. Plain POSIX awk, so mawk, gawk and BSD awk agree.
section="$(awk -v v="$VERSION" '
	index($0, "## [" v "]") == 1 { found = 1; next }
	found && /^## / { exit }
	found && $0 != "---" { lines[++n] = $0 }
	END {
		first = 1
		while (first <= n && lines[first] ~ /^[ \t]*$/) first++
		last = n
		while (last >= first && lines[last] ~ /^[ \t]*$/) last--
		for (i = first; i <= last; i++) print lines[i]
	}
' CHANGELOG.md)"

if [ -z "$section" ]; then
	echo "release-notes: CHANGELOG.md has no section for $VERSION" >&2
	exit 1
fi

# The link reference at the bottom of CHANGELOG.md, e.g.
# [0.5.0]: https://github.com/.../compare/v0.4.1...v0.5.0
link="$(awk -v v="$VERSION" 'index($0, "[" v "]: ") == 1 { print substr($0, length(v) + 5); exit }' CHANGELOG.md)"

printf 'Published to npm as [`customdomain-js@%s`](https://www.npmjs.com/package/customdomain-js/v/%s) and [`@customdomain/react@%s`](https://www.npmjs.com/package/@customdomain/react/v/%s), with provenance.\n\n' \
	"$VERSION" "$VERSION" "$VERSION" "$VERSION"
printf '%s\n\n' "$section"
printf '**Full changelog:** [CHANGELOG.md](%s/blob/main/CHANGELOG.md)' "$REPO_URL"
case "$link" in
*/compare/*) printf ' · **Diff:** [%s](%s)' "${link##*/compare/}" "$link" ;;
esac
printf '\n'
