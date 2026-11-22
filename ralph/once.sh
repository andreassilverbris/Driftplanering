#!/bin/bash

# Hela kroppen ligger i en klammer därför att bash läser ett skript löpande från
# disk. Ett varv som skriver om den här filen hade annars fått skalet att läsa
# vidare på fel plats i den nya. Ett sammansatt kommando parsas som en enhet
# innan det körs. Kroppen är oindenterad, eftersom afk.sh läser utfallskoderna
# med ett radankare, och blocket slutar med `exit`. Se DESIGN.md.
{
# once.sh – kör ETT Ralph-varv: en biljett, tagen hela vägen av en färsk agent.
#
# Varvet körs på den arbetsgren skriptet står på och lämnar den. Det vägrar starta på
# main, eftersom inget pushas direkt dit: arbetsgrenen förs in i main med en pull
# request när Andreas ber om det (beslut 50). Arbetsordningen står i `/biljett` och
# matas in som slash-kommando. prompt.md bär bara det som gäller när ingen tittar, och
# skickas som systemprompt-tillägg.
#
# Användning: ./once.sh <label> <spår>
# Exempel:    ./once.sh "" etapp-5          # tom label ger ready-for-agent

set -eo pipefail

LABEL="${1:-ready-for-agent}"
# Spåret AND:as med labeln. En biljett som bär spåret men inte labeln är inte
# färdigspecad och ska inte plockas.
TRACK="${2:-}"
# Loopen ska rulla obevakad, och acceptEdits stannar vid varje Bash-kommando.
# Kör PERMISSION_MODE=acceptEdits när du sitter med.
PERMISSION_MODE="${PERMISSION_MODE:-bypassPermissions}"
# Raden agenten skriver före sin sammanfattning. Allt efter den går in i passets
# körningsfil. Den definieras i .claude/commands/biljett.md, och ett test håller
# ihop de två.
SUMMARY_MARKER="RALPH SAMMANFATTNING"
# Remoten är GitHub. Kontrollen av pushen frågar varje push-URL, så en andra URL, till
# exempel en backupdisk, fungerar utan ändring.
PUSH_REMOTE="origin"
# Grenar varvet aldrig arbetar på. Det som förs in i main går via pull request.
PROTECTED_BRANCHES="main master"

# --- Varvets utfall ----------------------------------------------------
# Kanalen till afk.sh är exitkoden och inte en utskriven markör. Koderna har ett
# hem: afk.sh läser dem härifrån, och raderna måste stå i kolumn noll för det.
# Talen börjar på 10 för att inte kollidera med skalets egna koder.
OUTCOME_DONE=0
OUTCOME_EMPTY_QUEUE=10
OUTCOME_STALL=11
OUTCOME_AGENT_ERROR=12
OUTCOME_ENV_ERROR=13

# Ett varv som hänger får inte lämna passet stående utan besked. Gränsen ska aldrig
# fälla ett varv som arbetar: blir hela sviten röd körs den om efter lagningen.
TURN_LIMIT="${RALPH_TURN_LIMIT:-7200}"

# Hur länge ett kommando får köra i förgrunden. Bash-verktygets tak är annars tio
# minuter, och ett kommando som når det flyttas till bakgrunden, där det dör med turen.
# `/biljett` begär samma tid för sviten, och ett test håller ihop de två.
LONGEST_COMMAND_MS=3600000

# Spärrar mot main. Varvet pushar bara till sin arbetsgren och slår aldrig ihop en pull
# request (beslut 50). Mönstren är ett hinder och inget stängsel: den som skriver `bash -c`
# kommer runt dem. Regeln bärs av prompt.md och `/biljett`.
DENIED_TOOLS=(
"Bash(git push*main*)"
"Bash(git push*master*)"
"Bash(gh pr merge*)"
)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"

cd "$REPO_DIR"

# Läses här eftersom körningsblocket frågar efter den, och blocket skrivs ur en
# EXIT-trap som kan fyra före förkontrollerna.
branch=$(git rev-parse --abbrev-ref HEAD)

# --- Passets körningsfil -----------------------------------------------
# Varvet lägger sitt block när det är över, så att ett pass som dör i varv fyra
# ändå bär varv ett till tre. Filen pekas ut av afk.sh. Körs once.sh för hand finns
# ingen, och då skrivs inget block.
RUN_FILE="${RALPH_RUN_FILE:-}"
TURN_NUMBER="${RALPH_TURN:-}"

outcome_name() {
  case "$1" in
    "$OUTCOME_DONE") echo "KLART" ;;
    "$OUTCOME_EMPTY_QUEUE") echo "TOM KÖ" ;;
    "$OUTCOME_STALL") echo "STALL" ;;
    "$OUTCOME_AGENT_ERROR") echo "AGENTFEL" ;;
    "$OUTCOME_ENV_ERROR") echo "MILJÖFEL" ;;
    *) echo "OKÄNT ($1)" ;;
  esac
}

# Utsnittet tas från den sista förekomsten av markören, eftersom agenten kan ha ekat
# instruktionen på vägen. Saknas markören bär blocket utdatans svans och säger det:
# en tom källa och en oläst källa är olika saker.
agent_summary() {
  local text
  if [ -z "$agent_output" ] || [ ! -f "$agent_output" ]; then
    echo "(agenten kördes inte detta varv)"
    return 0
  fi
  text=$(awk -v m="$SUMMARY_MARKER" '
    index($0, m) == 1 { buf = ""; found = 1; next }
    found { buf = buf $0 "\n" }
    END { printf "%s", buf }
  ' "$agent_output")
  if [ -z "${text//[[:space:]]/}" ]; then
    echo "(ingen $SUMMARY_MARKER-rad i agentens utdata — sista raderna i stället)"
    echo ""
    tail -n 15 "$agent_output"
    return 0
  fi
  printf '%s\n' "$text"
}

# En push-URL som inte svarar, till exempel en omonterad backupdisk, ger en nollskild
# push trots att GitHub tagit emot, och varvet får inte falla på det. Kontrollen fäller därför ingenting. Den frågar varje
# URL om varvets commit och namnger den som inte har den. GIT_TERMINAL_PROMPT=0 gör
# att en URL som kräver inloggning faller i stället för att hänga varvet.
push_outcome() {
  local head_now="$1" urls url sha reached="" missing=""
  urls=$(git remote get-url --push --all "$PUSH_REMOTE" 2>/dev/null) || {
    echo "- Push: repot har ingen remote '$PUSH_REMOTE'."
    return 0
  }
  while IFS= read -r url; do
    [ -n "$url" ] || continue
    sha=$(GIT_TERMINAL_PROMPT=0 git ls-remote "$url" "refs/heads/$branch" 2>/dev/null \
          | awk 'NR == 1 { print $1 }')
    if [ "$sha" = "$head_now" ]; then
      reached="$reached $url"
    else
      missing="$missing $url"
    fi
  done <<< "$urls"

  if [ -z "$missing" ]; then
    echo "- Push: varvets commit ligger på samtliga push-URL:er för '$PUSH_REMOTE'."
    return 0
  fi
  echo "- Push (VARNING): varvets commit nådde inte:$missing"
  if [ -n "$reached" ]; then
    echo "  Den ligger på:$reached"
    echo "  Varvet fälls inte — en backup är inte ett beroende."
  else
    echo "  Ingen push-URL har den; committen finns bara lokalt."
  fi
}

write_run_block() {
  local code="$1" head_now heading
  [ -n "$RUN_FILE" ] || return 0
  head_now=$(git rev-parse HEAD 2>/dev/null || echo "")
  if [ -n "$issue_number" ]; then
    heading="#$issue_number $issue_title"
  else
    heading="ingen biljett valdes"
  fi
  {
    echo ""
    if [ -n "$TURN_NUMBER" ]; then
      echo "## Varv $TURN_NUMBER — $heading"
    else
      echo "## $heading"
    fi
    echo ""
    echo "- Tid: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "- Utfall: $(outcome_name "$code")"
    if [ -n "$head_before" ] && [ "$head_before" != "$head_now" ]; then
      echo "- Commit: $head_now"
      push_outcome "$head_now"
    else
      echo "- Commit: ingen ny commit detta varv."
    fi
    echo ""
    agent_summary
  } >> "$RUN_FILE" || {
    # Utfallet är redan bestämt, så felet fäller ingenting. Men afk.sh säger "inget
    # varv hann lägga ett block" om filen är tom, och det hade varit osant.
    echo "VARNING: kunde inte skriva varvets block till $RUN_FILE." >&2
    echo "Utfallet står i terminalen ovan; körningsfilen bär det inte." >&2
  }
}

# Blocket skrivs ur en EXIT-trap, så att en ny väg ut inte tyst saknar sitt block.
# Trapen bär också städningen av temp-filerna, eftersom en andra EXIT-trap hade
# skrivit över den här.
on_exit() {
  local code=$?
  write_run_block "$code" || true
  if [ -n "$agent_output" ]; then
    rm -f "$agent_output" "$timeout_flag" "$agent_done" 2>/dev/null || true
  fi
  exit "$code"
}
trap on_exit EXIT

# --- Förkontroller -----------------------------------------------------
# Det här är miljöfel och inget biljetten rår över: passet stannar, men biljetten
# lämnas orörd.
if [ -z "$TRACK" ]; then
  echo "FEL: inget spår angivet. Lägsta numret i hela kön är inte körordningen (beslut 50)."
  exit "$OUTCOME_ENV_ERROR"
fi
# Ett varv på main hade pushat direkt dit. En lös HEAD har ingen gren att pusha till.
for protected in $PROTECTED_BRANCHES HEAD; do
  if [ "$branch" = "$protected" ]; then
    echo "FEL: varvet står på '$branch'. Loopen arbetar på en arbetsgren, aldrig på main."
    echo "Byt först, till exempel:  git switch -c claude/etapp-5"
    exit "$OUTCOME_ENV_ERROR"
  fi
done
command -v claude >/dev/null || { echo "FEL: claude saknas"; exit "$OUTCOME_ENV_ERROR"; }
command -v gh >/dev/null || { echo "FEL: gh CLI saknas"; exit "$OUTCOME_ENV_ERROR"; }
command -v jq >/dev/null || { echo "FEL: jq saknas"; exit "$OUTCOME_ENV_ERROR"; }
gh auth status >/dev/null 2>&1 || { echo "FEL: gh är inte inloggad"; exit "$OUTCOME_ENV_ERROR"; }
[ -f "$PROMPT_FILE" ] || { echo "FEL: $PROMPT_FILE saknas"; exit "$OUTCOME_ENV_ERROR"; }
# Sviten är webbläsartester i Playwright. Utan installationen kan inget varv bli klart.
command -v node >/dev/null || { echo "FEL: node saknas"; exit "$OUTCOME_ENV_ERROR"; }
[ -d "$REPO_DIR/node_modules/playwright" ] || { echo "FEL: node_modules/playwright saknas. Kör npm install och npx playwright install chromium"; exit "$OUTCOME_ENV_ERROR"; }

# Ocommittade ändringar hade blandats in i varvets commit.
if [ -n "$(git status --porcelain)" ]; then
  echo "FEL: arbetskopian är inte ren. Committa eller stasha först."
  git status --short
  exit "$OUTCOME_ENV_ERROR"
fi

# --- Retry mot transienta GitHub-fel -----------------------------------
# GitHubs GraphQL-API svarar tidvis 503. Exponentiell backoff: 2, 4, 8, 16 s. Första
# fördröjningen är ställbar för sviten, som annars betalar för en väntan den inte mäter.
retry_gh() {
  local attempt=1 max=5 delay="${RALPH_RETRY_DELAY:-2}" out rc
  while :; do
    # rc fångas direkt efter tilldelningen, innan ett villkor skriver över $?.
    out=$("$@" 2>&1)
    rc=$?
    if [ "$rc" -eq 0 ]; then
      printf '%s' "$out"
      return 0
    fi
    if [ "$attempt" -ge "$max" ]; then
      echo "FEL: '$*' misslyckades efter $max försök" >&2
      echo "$out" >&2
      return "$rc"
    fi
    echo "Varning: gh-anrop misslyckades (försök $attempt/$max), väntar ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

# --- Hämta frontiern ---------------------------------------------------
# blockedBy.nodes innehåller också redan stängda blockerare, så det filtreras på
# state och inte på totalCount. Två --label AND:as av gh.
frontier_rc=0
frontier=$(retry_gh gh issue list \
  --state open \
  --label "$LABEL" \
  --label "$TRACK" \
  --limit 100 \
  --json number,title,body,blockedBy \
  --jq '[.[] | select([.blockedBy.nodes[] | select(.state == "OPEN")] | length == 0)] | sort_by(.number)') || frontier_rc=$?

if [ "$frontier_rc" -ne 0 ]; then
  echo "MILJÖFEL: kunde inte hämta frontiern från GitHub."
  echo "Biljetten är orörd — felet är inte dess."
  exit "$OUTCOME_ENV_ERROR"
fi

count=$(echo "$frontier" | jq 'length')

if [ "$count" -eq 0 ]; then
  echo "=== Ralph: Inga tillgängliga issues. ==="
  echo "NO MORE TASKS"
  exit "$OUTCOME_EMPTY_QUEUE"
fi

issue_number=$(echo "$frontier" | jq -r '.[0].number')
issue_title=$(echo "$frontier" | jq -r '.[0].title')

echo "=== Ralph startar $(date) ==="
echo "Spår: $TRACK"
echo "Frontier: $count tillgängliga issues"
echo "Vald: #$issue_number — $issue_title"
echo "Gren: $branch (varvet arbetar här och lämnar den)"

# --- Kör agenten -------------------------------------------------------
head_before=$(git rev-parse HEAD)

prompt=$(cat "$PROMPT_FILE")

# Prompten är exakt slash-kommandot, eftersom text efter numret hade följt med in i
# $ARGUMENTS. --disallowedTools tar flera värden och hade svalt prompten, så den står
# före en annan flagga.
#
# Utdatan går till en fil, så att ett avbrutet varv behåller det agenten hann skriva.
# Mallen skrivs ut i sin helhet eftersom `mktemp -t namn` faller på Linux.
agent_output="$(mktemp "${TMPDIR:-/tmp}/ralph-agent.XXXXXX")"
timeout_flag="$agent_output.timeout"
agent_done="$agent_output.done"

# CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 stänger av `claude --print`:s eget tak på
# 600 s för agentens bakgrundsagenter. code-reviews granskare går i bakgrunden, och i
# Leffe dödades de och varvet slutade utan commit. Hur länge ett varv får ta avgörs
# av vakthunden nedan. Variabeln gäller bara agenter: kommandon i bakgrunden dör med
# turen hur som helst, och därför BASH_MAX_TIMEOUT_MS. Se DESIGN.md. Variablerna sätts
# på anropet och exporteras inte.
BASH_MAX_TIMEOUT_MS="$LONGEST_COMMAND_MS" CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 claude \
  --print \
  --permission-mode "$PERMISSION_MODE" \
  --disallowedTools "${DENIED_TOOLS[@]}" \
  --append-system-prompt "$prompt" \
  "/biljett $issue_number" > "$agent_output" 2>&1 &
agent_pid=$!

# Vakthunden är skriven i skalet eftersom `timeout(1)` saknas på macOS. Den räknar ner
# i sekundhopp, eftersom ett `sleep` i ett stycke är en egen process som hade överlevt
# ett kill mot vakthunden och hållit varvet öppet efter att agenten blivit klar.
(
  left="$TURN_LIMIT"
  while [ "$left" -gt 0 ]; do
    [ -f "$agent_done" ] && exit 0
    sleep 1
    left=$((left - 1))
  done
  # TERM först, så att agenten kan avsluta sin utskrift, och KILL efter en frist.
  if kill -0 "$agent_pid" 2>/dev/null; then
    : > "$timeout_flag"
    kill -TERM "$agent_pid" 2>/dev/null || true
    grace=10
    while [ "$grace" -gt 0 ]; do
      [ -f "$agent_done" ] && exit 0
      kill -0 "$agent_pid" 2>/dev/null || exit 0
      sleep 1
      grace=$((grace - 1))
    done
    kill -KILL "$agent_pid" 2>/dev/null || true
  fi
) &
watchdog_pid=$!

# `|| agent_rc=$?` behövs eftersom set -e annars fäller varvet före utfallskontrollen
# när ett API-fel ger en nollskild kod mitt i svaret.
agent_rc=0
wait "$agent_pid" || agent_rc=$?
: > "$agent_done"
wait "$watchdog_pid" 2>/dev/null || true

result=$(cat "$agent_output")
echo "$result"

timed_out=no
if [ -f "$timeout_flag" ]; then
  timed_out=yes
  echo ""
  echo "VARNING: varvet överskred tidsgränsen på ${TURN_LIMIT}s och avbröts."
elif [ "$agent_rc" -ne 0 ]; then
  echo ""
  echo "VARNING: agenten avslutades med kod $agent_rc (API-fel eller avbrott)."
  echo "Varvet räknas som utan framsteg. Utfallskontrollen körs ändå — en"
  echo "commit som hann läggas innan avbrottet ska inte tappas bort."
fi

# Ett avbrutet varv lämnar ofta halvskrivna filer, och nästa varv vägrar starta på en
# smutsig arbetskopia. Resterna kan vara ett i praktiken färdigt varv, så de stashas i
# stället för att raderas. Bara när varvet gick fel: ett lyckat varvs rester är agentens
# eget val.
stash_leftovers() {
  [ -n "$(git status --porcelain)" ] || return 0
  echo "Sparar undan halvfärdiga ändringar från det avbrutna varvet:"
  git status --short
  stash_label="ralph: avbrutet varv #$issue_number $(date +%Y-%m-%dT%H:%M:%S)"
  if git stash push -u -m "$stash_label" >/dev/null 2>&1; then
    echo "Sparat som stash: $stash_label"
    echo "Återställ med:  git stash apply stash@{0}"
    echo "Kasta med:      git stash drop stash@{0}"
  else
    # Stash kan misslyckas mitt i en merge. En ren arbetskopia går då före resterna,
    # annars fastnar loopen helt.
    echo "VARNING: kunde inte stasha — nollar arbetskopian i stället."
    git reset --hard HEAD >/dev/null
    git clean -fd >/dev/null
  fi
}

if [ "$agent_rc" -ne 0 ] || [ "$timed_out" = yes ]; then
  stash_leftovers
fi

# --- Utfallskontroll ---------------------------------------------------
echo ""
echo "--- Utfall för #$issue_number ---"

# Tidsgränsen läses först: en avbruten agent hann sällan avsluta. Den ger inget omförsök,
# eftersom ett varv som hängt en gång troligen gör det igen och kostar två timmar till.
if [ "$timed_out" = yes ]; then
  echo "Varvet överskred tidsgränsen på ${TURN_LIMIT}s. Biljetten står öppen."
  echo "NO PROGRESS"
  echo "=== Ralph: Varv klart $(date) ==="
  exit "$OUTCOME_STALL"
fi

head_after=$(git rev-parse HEAD)

state_rc=0
issue_state=$(retry_gh gh issue view "$issue_number" --json state --jq '.state') || state_rc=$?

if [ "$state_rc" -ne 0 ]; then
  echo "MILJÖFEL: kunde inte läsa tillståndet för #$issue_number."
  echo "Biljetten är orörd — felet är inte dess."
  echo "=== Ralph: Varv klart $(date) ==="
  exit "$OUTCOME_ENV_ERROR"
fi

# Ett nollskilt agentutfall läses före stallet, eftersom ett API-fel är värt ett omförsök
# och ett stall inte är det. Också när biljetten hann stängas: agenten kan ha stängt med
# arbetet halvgjort, och det ska kontrolleras och inte räknas som klart.
if [ "$agent_rc" -ne 0 ]; then
  if [ "$issue_state" != "OPEN" ]; then
    echo "#$issue_number är stängd, men varvet avbröts (agentkod $agent_rc)."
    echo "Kontrollera resultatet innan du kör vidare."
  else
    echo "Varvet avbröts med agentkod $agent_rc — ett omförsök följer."
  fi
  echo "NO PROGRESS"
  echo "=== Ralph: Varv klart $(date) ==="
  exit "$OUTCOME_AGENT_ERROR"
fi

# Stängd biljett är kriteriet, inte ny commit: ett varv kan verifiera en implementation
# som redan låg på arbetsgrenen.
if [ "$issue_state" != "OPEN" ]; then
  if [ "$head_before" = "$head_after" ]; then
    echo "Klart: #$issue_number stängd (verifieringsvarv, ingen ny commit)."
  else
    echo "Klart: #$issue_number stängd, commit $head_after"
  fi
  echo "=== Ralph: Varv klart $(date) ==="
  exit "$OUTCOME_DONE"
fi

# Agenten avslutade med noll och biljetten är öppen. `/biljett` säger att en biljett
# varvet lämnar öppen byter etikett. Bär den kvar sin etikett har agenten alltså inte
# lämnat den, utan slutat mitt i, till exempel i väntan på ett kommando i bakgrunden.
labels_rc=0
still_queued=$(retry_gh gh issue view "$issue_number" --json labels \
  --jq "[.labels[].name] | index(\"$LABEL\") != null") || labels_rc=$?

if [ "$labels_rc" -ne 0 ]; then
  echo "MILJÖFEL: kunde inte läsa etiketterna på #$issue_number."
  echo "Biljetten är orörd — felet är inte dess."
  echo "=== Ralph: Varv klart $(date) ==="
  exit "$OUTCOME_ENV_ERROR"
fi

if [ "$still_queued" = true ]; then
  echo "Agenten slutade utan att stänga eller lämna #$issue_number. Varvet tog inte slut."
  stash_leftovers
  # Utan commit börjar omförsöket från samma punkt. Med en commit vet ingen hur långt den
  # kom, och en ny agent hade byggt vidare på något ingen granskat.
  if [ "$head_before" = "$head_after" ]; then
    echo "Ett omförsök följer."
    echo "NO PROGRESS"
    echo "=== Ralph: Varv klart $(date) ==="
    exit "$OUTCOME_AGENT_ERROR"
  fi
  echo "Commit gjord men inte stängd, och biljetten bär kvar sin etikett. Titta på"
  echo "committen på $branch innan passet startas om: nästa varv tar samma biljett."
  echo "NO PROGRESS"
  echo "=== Ralph: Varv klart $(date) ==="
  exit "$OUTCOME_STALL"
fi

# Agenten har lämnat biljetten och förklarat varför den inte kan avsluta. Ett omförsök
# gör samma sak igen.
if [ "$head_before" = "$head_after" ]; then
  echo "INGEN COMMIT — agenten committade ingenting detta varv."
else
  echo "Commit gjord, men issuen är fortfarande öppen (agenten lämnade den"
  echo "öppen och ska ha relabelat den ready-for-human). Arbetet ligger på"
  echo "$branch."
fi
echo "NO PROGRESS"
echo "=== Ralph: Varv klart $(date) ==="
exit "$OUTCOME_STALL"
}
