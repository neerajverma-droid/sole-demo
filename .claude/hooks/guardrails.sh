#!/usr/bin/env bash
# Claude Code PreToolUse guardrails (sole-ocr / sole-webapp).
#
# Blocks, before the tool runs:
#   1. Writes to GitHub / git remotes, and local git history changes
#      (push, commit, merge, rebase, reset, tag, gh pr create, gh api POST, ...).
#      Read-only git/gh commands still work.
#   2. Database writes: SQL write statements through a DB client, and every
#      migration / seed runner (npm run migrate*, run_migrations_range.js,
#      sequelize db:migrate, prisma migrate, ...).
#   3. File access outside this repo, unless the path is listed in
#      .claude/allowed-paths (one absolute path or prefix per line).
#   4. .env files (secrets): editing or writing is always blocked; reading asks
#      the user every time. .env.example / .env.sample / .env.template are free.
#
# Output: a PreToolUse "deny" decision with the reason, so Claude sees why and
# asks the user instead. Exit 0 always; a broken hook must not wedge the session.

set -u

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ROOT="${ROOT%/}"
ALLOW_FILE="$ROOT/.claude/allowed-paths"

decide() {
  jq -n --arg d "$1" --arg r "Guardrail: $2" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: $d,
      permissionDecisionReason: $r
    }
  }'
  exit 0
}
deny() { decide deny "$1"; }
# Asks the user. For Bash it's only used once every deny check has passed (ASK_REASON).
ask() { decide ask "$1"; }
ASK_REASON=""

# Canonicalise a path (no symlink resolution needed for prefix checks).
abspath() {
  local p="$1"
  case "$p" in
    "~") p="$HOME" ;;
    "~/"*) p="$HOME/${p#\~/}" ;;
    /*) ;;
    *) p="$PWD/$p" ;;
  esac
  # Collapse /./ and /../ segments.
  local out=() seg
  IFS='/' read -r -a parts <<<"$p"
  for seg in "${parts[@]}"; do
    case "$seg" in
      "" | ".") ;;
      "..") [ ${#out[@]} -gt 0 ] && unset 'out[${#out[@]}-1]' ;;
      *) out+=("$seg") ;;
    esac
  done
  local joined
  joined="$(printf '/%s' "${out[@]+"${out[@]}"}")"
  printf '%s' "${joined:-/}"
}

# Paths always allowed besides the repo: system binaries and devices, and
# Claude Code's own scratchpad. Everything else must be in .claude/allowed-paths.
SYSTEM_PREFIXES=(/dev/ /usr/ /bin/ /sbin/ /opt/homebrew/ /System/ /Library/Developer/ /private/tmp/claude- /tmp/claude-)

is_allowed_path() {
  local p
  p="$(abspath "$1")"
  [ "$p" = "$ROOT" ] && return 0
  case "$p" in "$ROOT"/*) return 0 ;; esac
  local s
  for s in "${SYSTEM_PREFIXES[@]}"; do
    case "$p" in "$s"*) return 0 ;; esac
  done
  [ "$p" = "/dev/null" ] && return 0
  if [ -f "$ALLOW_FILE" ]; then
    local line
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%%#*}"
      line="$(printf '%s' "$line" | sed 's/[[:space:]]*$//; s/^[[:space:]]*//')"
      [ -z "$line" ] && continue
      line="$(abspath "$line")"
      [ "$p" = "$line" ] && return 0
      case "$p" in "$line"/*) return 0 ;; esac
    done <"$ALLOW_FILE"
  fi
  return 1
}

is_env_file() {
  local base="${1##*/}"
  case "$base" in
    .env.example | .env.sample | .env.template | .env.*.example) return 1 ;;
    .env | .env.*) return 0 ;;
  esac
  return 1
}

# ── File tools ────────────────────────────────────────────────────────────────
case "$tool" in
  Read | Write | Edit | MultiEdit | NotebookEdit | Glob | Grep)
    path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // empty' <<<"$input")"
    if [ -n "$path" ]; then
      is_allowed_path "$path" || deny "$tool on '$path' is outside the repo ($ROOT). Ask the user to add it to .claude/allowed-paths first."
      if is_env_file "$path"; then
        case "$tool" in
          Read | Grep | Glob) ask "$tool on '$path' reads a .env file (secrets). Approve only if you want Claude to see it this time." ;;
          *) deny "$tool on '$path' is blocked: Claude never edits .env files. Change it yourself." ;;
        esac
      fi
    fi
    exit 0
    ;;
  Bash) ;;
  *) exit 0 ;;
esac

# ── Bash ──────────────────────────────────────────────────────────────────────
cmd="$(jq -r '.tool_input.command // empty' <<<"$input")"
[ -z "$cmd" ] && exit 0

# Lower-cased copy for keyword checks.
lc="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"

# Split the command into simple-command segments on ; && || | and newlines so
# "cd x && git push" is caught. (Heuristic, not a shell parser.)
segments="$(printf '%s\n' "$cmd" | sed -E 's/(\&\&|\|\||;|\|)/\n/g')"

# 1. git / gh
while IFS= read -r seg; do
  seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]*(sudo[[:space:]]+)?(env[[:space:]]+[^[:space:]]+=[^[:space:]]*[[:space:]]+)*//')"
  set -- $seg
  [ $# -eq 0 ] && continue
  case "$1" in
    git)
      shift
      # skip global options like -C dir, -c k=v, --no-pager
      while [ $# -gt 0 ]; do
        case "$1" in
          -C | -c) shift 2 ;;
          --no-pager | --paginate | -p | --bare) shift ;;
          --git-dir=* | --work-tree=*) shift ;;
          *) break ;;
        esac
      done
      sub="${1:-}"
      case "$sub" in
        status | diff | log | show | blame | ls-files | ls-tree | grep | rev-parse | describe | shortlog | cat-file | archive | fetch | reflog | whatchanged | name-rev | merge-base | count-objects | check-ignore | help | version | "") ;;
        branch)
          shift
          for a in "$@"; do
            case "$a" in -d | -D | -m | -M | -c | -C | --delete | --move | --copy | --set-upstream-to=* | -u | --unset-upstream | -f | --force) deny "'git branch $a' changes branches. Git write commands are blocked; ask the user to run it." ;; esac
          done
          # "git branch <name>" (no flag) creates a branch
          for a in "$@"; do case "$a" in -*) ;; *) deny "'git branch $a' creates a branch. Git write commands are blocked; ask the user to run it." ;; esac; done
          ;;
        remote)
          case "${2:-}" in "" | -v | --verbose | show | get-url) ;; *) deny "'git remote ${2:-}' changes remotes. Blocked." ;; esac
          ;;
        config)
          case "${2:-}" in --get | --get-all | --list | -l | --get-regexp) ;; *) deny "'git config' writes are blocked (read with --get / --list)." ;; esac
          ;;
        stash)
          case "${2:-}" in list | show) ;; *) deny "'git stash' changes the working tree. Git write commands are blocked; ask the user to run it." ;; esac
          ;;
        worktree)
          case "${2:-}" in list) ;; *) deny "'git worktree ${2:-}' is blocked. Ask the user to run it." ;; esac
          ;;
        *)
          deny "'git $sub' is a git write command (or talks to a remote). Pushing to GitHub and changing git history are blocked; ask the user to run it."
          ;;
      esac
      ;;
    gh)
      g1="${2:-}"
      g2="${3:-}"
      case "$g1" in
        api)
          if printf '%s' "$seg" | grep -Eqi -- '(-X|--method)[[:space:]=]*(post|put|patch|delete)|(^|[[:space:]])(-f|-F|--field|--raw-field|--input)([[:space:]=]|$)'; then
            deny "'gh api' write requests are blocked (GET only)."
          fi
          ;;
        auth | help | --version | version | status | search | browse) ;;
        pr | issue | run | workflow | release | repo | gist | label | project | secret | variable | ruleset | cache | codespace)
          case "$g2" in
            view | list | diff | checks | status | "" | --help) ;;
            *) deny "'gh $g1 $g2' writes to GitHub. Blocked; ask the user to run it." ;;
          esac
          ;;
        *) deny "'gh $g1' is not on the read-only list. Blocked; ask the user to run it." ;;
      esac
      ;;
  esac
done <<<"$segments"

# 2. Database writes
if printf '%s' "$lc" | grep -Eq '(^|[^a-z_])(mysql|mariadb|psql|sqlite3|mongosh|mongo|redis-cli|sequelize|sequelize-cli|knex|prisma|typeorm)([^a-z_-]|$)'; then
  if printf '%s' "$lc" | grep -Eq '(^|[^a-z_])(insert|update|delete|drop|alter|create|truncate|replace|rename|grant|revoke|merge|upsert|set[[:space:]]+global|flushall|flushdb|del|hset|lpush|db:migrate|db:seed|db:drop|db:create|migrate|seed|db[[:space:]]+push)([^a-z_]|$)'; then
    deny "Database writes are blocked (SQL write statements, migrations, seeds). Show the user the statement and let them run it."
  fi
  # A DB client fed from a file or heredoc can't be checked; refuse it.
  if printf '%s' "$lc" | grep -Eq '(mysql|mariadb|psql|sqlite3)[^|;&]*(<|--file|-f[[:space:]])'; then
    deny "Running SQL from a file through a DB client is blocked (can't be checked for writes). Let the user run it."
  fi
fi
# Only EXECUTING a migration/seed is blocked: npm scripts, or node/sh/bash/ts-node
# running a migration or seed file. Reading, grepping and linting them is fine.
if printf '%s' "$lc" | grep -Eq '(npm|pnpm|yarn)[[:space:]]+(run[[:space:]]+)?(migrate|seed|db)[a-z:_-]*|(^|[[:space:];&|(])(node|sh|bash|ts-node|tsx)[[:space:]][^;&|]*(run_migrations[a-z_]*|run_dashboards_migrations|migrations/[^[:space:]]*\.(sql|js)|(seed|migrat)[a-z_]*\.js)|(^|[[:space:];&|(])\./(run_migrations|run_dashboards_migrations)'; then
  deny "Migration and seed runners are blocked: they write to the database. Write the migration file; the user runs it."
fi

# 3. .env access from the shell: writing is blocked, reading asks the user.
#    .env.example / .sample / .template are removed first so they never count.
env_cmd="$(printf '%s' "$cmd" | sed -E 's#\.env\.(example|sample|template)##g')"
ENV_RE='\.env(\.[A-Za-z0-9_-]+)?'
END_RE='([^A-Za-z0-9_.-]|$)'
if printf '%s' "$env_cmd" | grep -Eq "(^|[[:space:]/\"'=<>])${ENV_RE}${END_RE}"; then
  if printf '%s' "$env_cmd" | grep -Eq "(>>?|tee([[:space:]]+-a)?)[[:space:]]*[\"']?[^[:space:];|&]*${ENV_RE}${END_RE}" \
    || printf '%s' "$env_cmd" | grep -Eq "(sed|perl|ruby)[^;&|]*[[:space:]]-i[^;&|]*${ENV_RE}" \
    || printf '%s' "$env_cmd" | grep -Eq "(^|[[:space:];&|(])(cp|mv|rm|truncate|ln|install|chmod|chown|touch|dd|rsync|unlink|shred)[[:space:]][^;&|]*${ENV_RE}${END_RE}"; then
    deny "Writing, moving or deleting .env files is blocked. Change them yourself."
  fi
  ASK_REASON="This command reads a .env file (secrets). Approve only if you want Claude to see it this time."
fi

# 4. Paths outside the repo
# A quoted path is one token even with spaces in it ("/Applications/Google Chrome.app/…").
# Those are taken first and blanked out; the rest is split on whitespace.
quoted="$(printf '%s' "$cmd" | grep -Eo "\"(~|/|\.\./)[^\"]*\"|'(~|/|\.\./)[^']*'" | sed -E "s/^[\"']//; s/[\"']\$//")"
unquoted="$(printf '%s' "$cmd" | sed -E "s/\"(~|\/|\.\.\/)[^\"]*\"/ /g; s/'(~|\/|\.\.\/)[^']*'/ /g")"
# Absolute, home-relative and parent-relative tokens; remaining quotes stripped.
tokens="$(printf '%s\n' "$quoted"; printf '%s' "$unquoted" | tr '"'"'"'' '  ' | grep -Eo '(^|[[:space:]=:(])(~|/|\.\./)[^[:space:];|&)<>]*' | sed -E 's/^[[:space:]=:(]//')"
while IFS= read -r t; do
  [ -z "$t" ] && continue
  case "$t" in
    / | //* | http* | /api/* ) continue ;;  # bare slash (regex/split text), URLs, route strings
  esac
  # Glob or regex fragments like /^x/ or /\d/ are not paths.
  case "$t" in *'^'* | *'\'* | *'$'*'/'* ) continue ;; esac
  is_allowed_path "$t" || deny "Command touches '$t', outside the repo ($ROOT). Ask the user to add it to .claude/allowed-paths first."
done <<<"$tokens"

# cd into somewhere outside
cdt="$(printf '%s' "$cmd" | grep -Eo '(^|[;&|[:space:]])cd[[:space:]]+[^;&|[:space:]]+' | awk '{print $NF}')"
while IFS= read -r t; do
  [ -z "$t" ] && continue
  is_allowed_path "$t" || deny "'cd $t' leaves the repo ($ROOT). Ask the user to add it to .claude/allowed-paths first."
done <<<"$cdt"

# Nothing was denied. If the command reads a .env file, ask the user.
[ -n "$ASK_REASON" ] && ask "$ASK_REASON"

exit 0
