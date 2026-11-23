#!/bin/bash

# Klammern, den oindenterade kroppen och det avslutande `exit` har samma skäl som i
# once.sh: ett varv kan skriva om det här skriptet medan det kör. Se DESIGN.md.
{
# afk.sh – kör Ralph-loopen: flera varv inom ett spår, tills kön är tom eller något
# stoppar passet. Passet grenar på once.sh:s exitkod.
#
# Användning: ./afk.sh <antal_iterationer> <spår>
# Exempel:    ./afk.sh 1 etapp-5          # ett varv – börja ALLTID så
#             ./afk.sh 7 etapp-5

set -eo pipefail

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Användning: $0 <iterationer> <spår>"
  echo "Exempel:   $0 1 etapp-5"
  echo "Spåret är en etikett. Utan det hade loopen tagit lägsta numret i hela kön,"
  echo "och det är inte körordningen (beslut 50)."
  exit 1
fi

ITERATIONS=$1
TRACK=$2
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ONCE="$SCRIPT_DIR/once.sh"
NOTIFY="$SCRIPT_DIR/notify.py"

# --- Passets körningsfil -----------------------------------------------
# Skrivs löpande, ett block per varv, av once.sh. Katalogen ligger utanför git, eftersom
# passets eget spår annars hade gjort arbetskopian smutsig och spärrat nästa varv.
RUN_FILE="${RALPH_RUN_FILE:-$SCRIPT_DIR/runs/$(date +%Y-%m-%dT%H.%M.%S).md}"
mkdir -p "$(dirname "$RUN_FILE")" 2>/dev/null || true
export RALPH_RUN_FILE="$RUN_FILE"

# Koderna läses ur once.sh i stället för att skrivas av. Kan de inte läsas vet passet inte
# vad ett varv betyder, och då är det bättre att inte starta: tilldelningen får nollskild
# kod och set -e fäller skriptet.
read_outcome_code() {
  local name="$1" value
  value=$(sed -n "s/^OUTCOME_${name}=\([0-9]\{1,\}\)$/\1/p" "$ONCE" | head -1)
  if [ -z "$value" ]; then
    echo "FEL: once.sh definierar ingen OUTCOME_$name" >&2
    exit 1
  fi
  echo "$value"
}

[ -f "$ONCE" ] || { echo "FEL: $ONCE saknas"; exit 1; }

OUTCOME_DONE=$(read_outcome_code DONE)
OUTCOME_EMPTY_QUEUE=$(read_outcome_code EMPTY_QUEUE)
OUTCOME_STALL=$(read_outcome_code STALL)
OUTCOME_AGENT_ERROR=$(read_outcome_code AGENT_ERROR)
OUTCOME_ENV_ERROR=$(read_outcome_code ENV_ERROR)

# Ett API-fel, eller en agent som slutade mitt i, ska inte kosta ett helt pass. Exakt ett
# omförsök: ett upprepat avbrott är inte transient längre.
MAX_AGENT_ERRORS=1
agent_errors=0

# --- Passets bokslut ---------------------------------------------------
# Beskedet är en rubrik och en rad. Hur det gick frågar Andreas Claude om, och Claude
# läser körningsfilen: skälet till ett avbrott står där och inte här.
HEADING_CLEAN='Rent stall'
HEADING_STOPPED='Ralph avbruten'

#: Varv som fick utfallet KLART. Det är biljetterna passet implementerade.
implemented=0
#: Högsta biljettnumret i repot när passet startade. Skillnaden mot slutet är de
#: biljetter som skapades medan passet körde. En biljett Andreas själv skapar under
#: samma tid räknas med, och det godtas.
highest_at_start=""
#: Passets väggtid, mätt i sekunder sedan starten.
started_at=$(date +%s)

# Räknarna läses med anrop utan retry, eftersom ingen av dem får fälla passet: ett tal
# som inte gick att läsa blir ett tomt tal, och raden utelämnar det den inte vet.
#
# Numret sorteras här och inte av gh: gh ger i praktiken den nyaste först, men det är
# inte beställt, och det är det högsta numret som ska räknas.
highest_issue_number() {
  gh issue list --state all --limit 500 --json number \
    --jq '[.[].number] | max // 0' 2>/dev/null || true
}

#: Biljetter passet räknade med att ta: `ready-for-agent` i spåret vid starten, men
#: aldrig fler än iterationerna. Ett pass tar inte fler varv än det har.
#
#: Blockerarfiltret är once.sh:s eget: en blockerad biljett kan passet inte ta, och
#: hade gjort N till ett tal det aldrig kunde nå. Också en stängd blockerare står kvar
#: i `blockedBy.nodes`, så det filtreras på state och inte på totalCount.
tickets_in_queue() {
  gh issue list --state open --label ready-for-agent --label "$TRACK" \
    --limit 100 --json number,blockedBy \
    --jq '[.[] | select([.blockedBy.nodes[] | select(.state == "OPEN")] | length == 0)] | length' \
    2>/dev/null || true
}

# Talen böjs: en biljett är implementerad, två är implementerade.
inflect() {
  local count="$1" singular="$2" plural="$3"
  if [ "$count" = 1 ]; then echo "$singular"; else echo "$plural"; fi
}

# Väggtiden: `4h 35m`, och under en timme bara som minuter: `42m`.
wall_time() {
  local seconds="$1" hours minutes
  hours=$((seconds / 3600))
  minutes=$(((seconds % 3600) / 60))
  if [ "$hours" -gt 0 ]; then
    echo "${hours}h ${minutes}m"
  else
    echo "${minutes}m"
  fi
}

#: Biljetter som skapades medan passet körde, eller tomt när talet inte gick att läsa.
created_tickets() {
  local now
  [ -n "$highest_at_start" ] || return 0
  now=$(highest_issue_number)
  [ -n "$now" ] || return 0
  if [ "$now" -gt "$highest_at_start" ] 2>/dev/null; then
    echo $((now - highest_at_start))
  else
    echo 0
  fi
}

#: Antalet biljetter passet räknade med att ta, eller `?` när talet inte gick att läsa.
expected_tickets() {
  if [ -z "$queued_at_start" ]; then
    echo "?"
  elif [ "$queued_at_start" -gt "$ITERATIONS" ] 2>/dev/null; then
    echo "$ITERATIONS"
  else
    echo "$queued_at_start"
  fi
}

#: Raden ett pass som gick bra säger.
clean_line() {
  local created elapsed line
  elapsed=$(( $(date +%s) - started_at ))
  line="$implemented $(inflect "$implemented" biljett biljetter)"
  line="$line $(inflect "$implemented" implementerad implementerade) på $(wall_time "$elapsed")."
  created=$(created_tickets)
  # Skapades ingen biljett utelämnas meningen. Så också när talet inte gick att läsa:
  # en mening som inte vet sitt tal säger ingenting.
  if [ -n "$created" ] && [ "$created" -gt 0 ] 2>/dev/null; then
    line="$line $created $(inflect "$created" biljett biljetter) skapades."
  fi
  echo "$line"
}

#: Raden ett pass som stannade säger. Skälet står i körningsfilen.
stopped_line() {
  local turn="$1" expected line
  line="$implemented $(inflect "$implemented" biljett biljetter)"
  line="$line $(inflect "$implemented" implementerad implementerade)."
  expected=$(expected_tickets)
  line="$line Avbrott vid biljett $turn av $expected i loopen."
  echo "$line"
}

# Beskedet skrivs ut oavsett hur notisen gick: en notis ska aldrig fälla ett pass, och
# terminalen är det enda som säkert bär det. Rubriken och raden är passets sista, och
# inget mer — utom raden om att notisen inte gick fram, som finns just för att säga att
# de två raderna ovan är allt som kom någon vart.
close_pass() {
  local heading="$1" line="$2" code="$3" alarm=()
  [ "$code" -eq 0 ] || alarm=(--alarm)
  echo ""
  echo "$heading"
  echo "$line"

  if [ ! -x "$NOTIFY" ]; then
    echo "(ingen notis skickad: $NOTIFY saknas eller är inte körbar)"
  elif ! "$NOTIFY" "${alarm[@]}" "$heading" "$line"; then
    echo "(notisen gick inte fram — beskedet ovan är det som gäller)"
  fi
  exit "$code"
}

# Ett pass som stannade: varvet som stannade, och skälet, som bara terminalen och
# körningsfilen bär. Notisens rad säger hur långt passet kom.
stop_pass() {
  local turn="$1" reason="$2"
  echo ""
  echo "=== Varv $turn stannade passet: $reason ==="
  echo "=== Skälet står i körningsfilen $RUN_FILE. $(date) ==="
  close_pass "$HEADING_STOPPED" "$(stopped_line "$turn")" 1
}

#: Ett pass som gick bra: kön blev tom, eller alla iterationer hanns med.
finish_pass() {
  local reason="$1"
  echo ""
  echo "=== $reason $(date) ==="
  close_pass "$HEADING_CLEAN" "$(clean_line)" 0
}

echo "=== Ralph AFK-loop startar: $ITERATIONS iterationer ==="
echo "=== Spår: $TRACK ==="
echo "=== Körningsfil: $RUN_FILE ==="
echo "=== $(date) ==="

# Räknas före första varvet, eftersom det är läget vid starten som beskedet talar om.
highest_at_start=$(highest_issue_number)
queued_at_start=$(tickets_in_queue)

# Huvudet skrivs före första varvet, så att filen säger vad det var för pass också när det
# dör direkt. Ett spår som inte går att skriva fäller inte passet, men det sägs rakt ut.
{
  echo "# Ralph-pass $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  echo "- Iterationer: $ITERATIONS"
  echo "- Spår: $TRACK"
} >> "$RUN_FILE" || {
  echo "VARNING: kunde inte skriva passets huvud till $RUN_FILE."
  echo "Passet kör vidare, men spåret hamnar bara i terminalen."
}

for ((i=1; i<=ITERATIONS; i++)); do
  echo ""
  echo "--- Iteration $i/$ITERATIONS ---"

  outcome=0
  # Tom label ger once.sh:s egen default, så att den har ett enda hem.
  RALPH_TURN="$i" "$ONCE" "" "$TRACK" || outcome=$?

  case "$outcome" in
    "$OUTCOME_DONE")
      implemented=$((implemented + 1))
      agent_errors=0
      ;;

    "$OUTCOME_EMPTY_QUEUE")
      finish_pass "Ralph klar: kön är tom efter $i iterationer."
      ;;

    "$OUTCOME_STALL")
      # Ett omförsök gör samma sak igen.
      stop_pass "$i" \
        "rent stall — varvet gav inget framsteg och biljetten står öppen"
      ;;

    "$OUTCOME_AGENT_ERROR")
      agent_errors=$((agent_errors + 1))
      if [ "$agent_errors" -gt "$MAX_AGENT_ERRORS" ]; then
        stop_pass "$i" \
          "upprepat agentfel — omförsöket gjorde samma sak, och ett upprepat avbrott är inte transient. Se git stash list"
      fi
      echo ""
      echo "!!! Varvet tog inte slut — gör ett omförsök ($agent_errors/$MAX_AGENT_ERRORS) !!!"
      ;;

    "$OUTCOME_ENV_ERROR")
      # Biljetten lämnas orörd: felet är inte dess.
      stop_pass "$i" \
        "miljöfel — GitHub nere, smutsig arbetskopia, eller ett verktyg som saknas. Biljetten är orörd"
      ;;

    *)
      stop_pass "$i" \
        "okänt utfall ($outcome) — en kod once.sh inte definierar, och i sig ett fel att titta på"
      ;;
  esac
done

# Alla iterationer hanns med. `finish_pass` avslutar själv, men raden står kvar
# eftersom klammerns sista sats ska vara ett `exit`: se kommentaren i huvudet.
finish_pass "Ralph: Max iterationer ($ITERATIONS) nådda."

exit 0
}
