"""Sömmen mot Ralph-loopens skalskript.

Ett riktigt git-repo i en tempkatalog, med `ralph/`-skripten kopierade oförändrade
dit och stubbar för `claude` och `gh` först på PATH. Skripten körs alltså som de
står i repot, och det som mäts är vad de faktiskt gjorde. `git` och `jq` körs på
riktigt, så att frontierns filter mäts och inte härmas.

Repot står på en arbetsgren, `WORK_BRANCH`, eftersom varvet vägrar starta på
`main`. `main` finns ändå, som i det riktiga repot, så att ett test kan ställa
varvet där.

Agenten spelas av ett manus, ett skalskript testet väljer, som `claude`-stubben
kör. Ett manus lägger sina rader på en egen rad, eftersom det sista kommandot
sätter agentens exitkod.
"""

import json
import os
import shutil
import stat
import subprocess
from pathlib import Path
from typing import NamedTuple

from conftest import REPO_ROOT

RALPH = Path(REPO_ROOT) / 'ralph'
ONCE = RALPH / 'once.sh'
AFK = RALPH / 'afk.sh'
PROMPT = RALPH / 'prompt.md'
DESIGN = RALPH / 'DESIGN.md'
TICKET_COMMAND = Path(REPO_ROOT) / '.claude' / 'commands' / 'biljett.md'

#: Spåret testerna kör, och som biljetterna bär om testet inte säger annat.
TRACK = 'testspår'

#: Arbetsgrenen repot står på. Loopen arbetar aldrig på `main` (beslut 50).
WORK_BRANCH = 'claude/testgren'

#: Taket i `claude --print` för agentens bakgrundsjobb.
BACKGROUND_CEILING = 'CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS'

#: Taket i Bash-verktyget. Ett kommando som når det flyttas till bakgrunden.
COMMAND_CEILING = 'BASH_MAX_TIMEOUT_MS'

#: Ett helt varv: skriver en fil, committar och stänger biljetten, som `/biljett`.
FULL_TURN = """
echo "rad från varvet" >> work.txt
git add -A
git commit -q -m "Varvets arbete (#$RALPH_HARNESS_TICKET)"
gh issue close "$RALPH_HARNESS_TICKET" --comment "klart"
echo "RALPH SAMMANFATTNING"
echo "Byggde raden i work.txt."
echo "Testerna gröna."
echo "Osäker på: ingenting."
"""

#: Samma varv, med pushen, som `/biljett` skriver den. `|| true` eftersom en push mot
#: en URL som inte svarar annars hade gjort varvet till ett agentfel, och inte det
#: testet mäter.
FULL_TURN_WITH_PUSH = FULL_TURN.replace(
    'echo "RALPH SAMMANFATTNING"',
    'git push origin HEAD || true\necho "RALPH SAMMANFATTNING"',
)

TURN_WITHOUT_MARKER = """
echo "rad från varvet" >> work.txt
git add -A
git commit -q -m "Varvets arbete (#$RALPH_HARNESS_TICKET)"
gh issue close "$RALPH_HARNESS_TICKET" --comment "klart"
echo "En sammanfattning utan markör ovanför sig."
"""

#: Committar men lämnar biljetten öppen.
LEAVES_IT_OPEN = """
echo "halvfärdigt" >> work.txt
git add -A
git commit -q -m "Halvt varv (#$RALPH_HARNESS_TICKET)"
gh issue edit "$RALPH_HARNESS_TICKET" --add-label ready-for-human --remove-label ready-for-agent
echo "RALPH SAMMANFATTNING"
echo "Kan inte verifieras här, lämnar öppen."
"""

#: Avslutar med noll, committar ingenting och lämnar biljetten öppen.
PURE_STALL = """
gh issue edit "$RALPH_HARNESS_TICKET" --add-label ready-for-human --remove-label ready-for-agent
echo "RALPH SAMMANFATTNING"
echo "Kriteriet kräver en människa. Lämnar öppen."
"""

#: Slutar med noll mitt i arbetet, utan att stänga eller lämna biljetten. Så såg ett
#: varv ut i photo_manager: turen tog slut medan sviten körde i bakgrunden.
ENDS_MIDWAY = """
echo "halvskrivet" >> begun.txt
echo "Jag väntar på att sviten blir klar."
"""

#: Samma sak efter committen, till exempel medan sviten körs om efter granskningen.
ENDS_MIDWAY_AFTER_COMMIT = """
echo "rad från varvet" >> work.txt
git add -A
git commit -q -m "Varvets arbete (#$RALPH_HARNESS_TICKET)"
echo "halvskrivet" >> begun.txt
echo "Jag väntar på att sviten blir klar."
"""

#: Avbryts mitt i, med en halvskriven fil kvar i trädet.
INTERRUPTED = """
echo "halvskrivet" >> begun.txt
exit 1
"""

#: Hänger längre än varvets tidsgräns, med en halvskriven fil kvar i trädet.
HANGS = """
echo "halvskrivet" >> begun.txt
sleep 30
"""


def turn_that_rewrites(target, rewrite):
    """Ett helt varv som dessutom skriver om ett av loopens egna skript.

    `rewrite` är Python som sätter `new` ur `lines`. Radbrytningen skrivs som
    `chr(10)` eftersom strängen passerar både den här källan och manusfilen.
    """
    return (
        "python3 - <<'PY'\n"
        'from pathlib import Path\n'
        f'p = Path("{target}")\n'
        'lines = p.read_text(encoding="utf-8").splitlines(keepends=True)\n'
        f'{rewrite}\n'
        'p.write_text("".join(new), encoding="utf-8")\n'
        'PY\n'
    ) + FULL_TURN


#: Filen växer: offseten hamnar mitt i en rad i den nya filen.
GROWS = 'new = lines[:1] + ["# en rad som flyttar varenda byte" + chr(10)] * 200 + lines[1:]'

#: Filen krymper: offseten hamnar bortom slutet, och bash avslutar tyst med
#: senaste kommandots kod.
SHRINKS = 'new = [lines[0]] + [r for r in lines[1:] if not r.lstrip().startswith("#")]'


def ticket(number, title=None, blockers=(), labels=('ready-for-agent', TRACK)):
    return {
        'number': number,
        'title': title or f'Biljett {number} — en titel med tankstreck',
        'body': '## What to build\n\nNågot.\n',
        'labels': list(labels),
        'blockedBy': {
            'nodes': [{'state': state} for state in blockers],
            'totalCount': len(blockers),
        },
    }


def shell_scripts(directory=RALPH):
    """Loopens skalskript, frågade ur katalogen så att ett nytt inte glöms bort."""
    return sorted(directory.glob('*.sh'))


def outcome_code(name):
    """Koden `once.sh` definierar, läst genom `afk.sh`:s egen läsare."""
    source = AFK.read_text(encoding='utf-8')
    start = source.index('read_outcome_code() {')
    function = source[start:source.index('\n}\n', start) + len('\n}\n')]
    shell = f'{function}ONCE="{ONCE}"; read_outcome_code {name}'
    result = subprocess.run(['bash', '-c', shell], capture_output=True, text=True)
    value = result.stdout.strip()
    assert value.isdigit(), f'afk.sh kunde inte läsa OUTCOME_{name}: {result!r}'
    return int(value)


GH_STUB = """
state_file() { echo "$RALPH_HARNESS_STATE/$1"; }
label_file() { echo "$RALPH_HARNESS_STATE/$1.labels"; }

# En relabel mitt i ett pass ändrar vad biljetten bär, och det ska mätas.
issues_with_their_labels() {
  local current f number changes
  current=$(jq -c '.' "$RALPH_HARNESS_ISSUES")
  for f in "$RALPH_HARNESS_STATE"/*.labels; do
    [ -f "$f" ] || continue
    number=$(basename "$f" .labels)
    changes=$(jq -Rn --rawfile lines "$f" '$lines | split("\\n") | map(select(. != ""))')
    current=$(printf '%s' "$current" | jq -c --arg n "$number" --argjson e "$changes" \\
      'map(if (.number|tostring) == $n
           then .labels = (((.labels // []) + ($e | map(select(startswith("+")) | .[1:])))
                           - ($e | map(select(startswith("-")) | .[1:])))
           else . end)')
  done
  printf '%s' "$current"
}

if [ "$1 $2" != "auth status" ] && [ -n "${RALPH_HARNESS_GH_FAILS:-}" ]; then
  echo "gh: API-fel" >&2
  exit 1
fi

case "$1 $2" in
  "auth status") exit 0 ;;
  "issue list")
    expression='.'
    # Flera --label AND:as, som hos gh. --state all tar också de stängda. --limit skär
    # listan, och ordningen den skär i är gh:s: den nyaste först, alltså högsta numret.
    label_lines=''
    all_states=no
    limit=100
    for ((i = 1; i <= $#; i++)); do
      if [ "${!i}" = "--jq" ]; then j=$((i + 1)); expression="${!j}"; fi
      if [ "${!i}" = "--label" ]; then j=$((i + 1)); label_lines="$label_lines${!j}"$'\\n'; fi
      if [ "${!i}" = "--limit" ]; then j=$((i + 1)); limit="${!j}"; fi
      if [ "${!i}" = "--state" ]; then j=$((i + 1)); [ "${!j}" = all ] && all_states=yes; fi
    done
    required=$(printf '%s' "$label_lines" | jq -Rn '[inputs | select(. != "")]')
    closed=""
    if [ "$all_states" = no ]; then
      for f in "$RALPH_HARNESS_STATE"/*; do
        case "$f" in *.labels) continue ;; esac
        [ -f "$f" ] || continue
        if [ "$(cat "$f")" != "OPEN" ]; then
          closed="$closed $(basename "$f")"
        fi
      done
    fi
    issues_with_their_labels | jq --arg closed "$closed" --argjson required "$required" \\
      --argjson limit "$limit" \\
      '($closed | split(" ") | map(select(. != ""))) as $c
       | [.[] | (.number|tostring) as $n
              | select($c | index($n) | not)
              | select((($required - (.labels // [])) | length) == 0)]
       | sort_by(-.number)[:$limit]' \\
      | jq -r "$expression"
    ;;
  "issue create")
    # Ett varv som skriver upp ett fynd. Numret blir ett högre än det högsta, som hos
    # GitHub, så att passet kan räkna skillnaden.
    next=$(jq '[.[].number] | (max // 0) + 1' "$RALPH_HARNESS_ISSUES")
    labels=''
    title='En biljett ett varv skrev'
    for ((i = 1; i <= $#; i++)); do
      if [ "${!i}" = "--label" ]; then j=$((i + 1)); labels="$labels${!j}"$'\\n'; fi
      if [ "${!i}" = "--title" ]; then j=$((i + 1)); title="${!j}"; fi
    done
    jq -c --argjson n "$next" --arg t "$title" \\
      --argjson l "$(printf '%s' "$labels" | jq -Rn '[inputs | select(. != "")]')" \\
      '. + [{number: $n, title: $t, body: "", labels: $l,
             blockedBy: {nodes: [], totalCount: 0}}]' \\
      "$RALPH_HARNESS_ISSUES" > "$RALPH_HARNESS_ISSUES.new"
    mv "$RALPH_HARNESS_ISSUES.new" "$RALPH_HARNESS_ISSUES"
    echo OPEN > "$(state_file "$next")"
    echo "https://github.invalid/issues/$next"
    ;;
  "issue view")
    case " $* " in
      *" labels "*)
        expression='.'
        for ((i = 1; i <= $#; i++)); do
          if [ "${!i}" = "--jq" ]; then j=$((i + 1)); expression="${!j}"; fi
        done
        issues_with_their_labels | jq -c --arg n "$3" \\
          '[.[] | select((.number|tostring) == $n)][0] | {labels: ((.labels // []) | map({name: .}))}' \\
          | jq -r "$expression"
        ;;
      *)
        file=$(state_file "$3")
        [ -f "$file" ] && cat "$file" || echo OPEN
        ;;
    esac
    ;;
  "issue close")
    echo CLOSED > "$(state_file "$3")"
    ;;
  "issue edit")
    file=$(label_file "$3")
    for ((i = 1; i <= $#; i++)); do
      if [ "${!i}" = "--add-label" ]; then j=$((i + 1)); echo "+${!j}" >> "$file"; fi
      if [ "${!i}" = "--remove-label" ]; then j=$((i + 1)); echo "-${!j}" >> "$file"; fi
    done
    ;;
  *) echo "gh-stubben kan inte '$*'" >&2; exit 1 ;;
esac
exit 0
"""


class Notice(NamedTuple):
    """Ett besked som nådde notisskriptet."""

    heading: str
    line: str
    alarm: bool


class RalphRepo:
    """Ett tempdir-repo med stubbade kommandon, byggt en gång per test."""

    def __init__(self, root, tickets=None):
        self.root = Path(root)
        self.repo = self.root / 'repo'
        self.bin = self.root / 'bin'
        self.state = self.root / 'state'
        self.call_log = self.root / 'calls.log'
        self.claude_argv = self.root / 'claude_argv'
        self.claude_env = self.root / 'claude_env'
        self.gh_ceiling = self.root / 'gh_ceiling'
        self.issues = self.root / 'issues.json'
        self.script = self.root / 'agent.sh'

        self.bin.mkdir()
        self.state.mkdir()
        self.call_log.write_text('', encoding='utf-8')

        self._write_stubs()
        self._build_repo()
        self.set_frontier(tickets if tickets is not None else [ticket(42)])
        self.set_agent(FULL_TURN)

    def _git(self, *args):
        return subprocess.run(
            ['git', *args], cwd=self.repo, capture_output=True, text=True, check=True
        )

    def _stub(self, name, body):
        path = self.bin / name
        path.write_text(f'#!/bin/bash\n{body}\n', encoding='utf-8')
        path.chmod(path.stat().st_mode | stat.S_IEXEC)
        return path

    def _write_stubs(self):
        log = 'printf "%s\\n" {} >> "$RALPH_HARNESS_CALLS"\n'.format

        # claude antecknar sin argv (NUL-separerad, eftersom prompten bär
        # radbrytningar) och sin miljö, och kör testets manus. Utan
        # RALPH_HARNESS_AGENT_RC gäller manusets egen kod.
        self._stub(
            'claude',
            'prompt="${!#}"\n'
            + log('"claude $prompt"')
            + 'printf "%s\\0" "$@" > "$RALPH_HARNESS_CLAUDE_ARGV"\n'
            + 'env -0 > "$RALPH_HARNESS_CLAUDE_ENV"\n'
            + 'export RALPH_HARNESS_IN_AGENT=agent\n'
            + 'export RALPH_HARNESS_TICKET="${prompt##/biljett }"\n'
            + 'script_rc=0\n'
            + 'bash "$RALPH_HARNESS_AGENT" || script_rc=$?\n'
            + 'exit "${RALPH_HARNESS_AGENT_RC:-$script_rc}"',
        )

        # Varje gh-anrop antecknar vem som gjorde det och om bakgrundstaket
        # syntes, eftersom en export bara märks i en process utanför agenten.
        self._stub(
            'gh',
            log('"gh $*"')
            + 'printf "%s %s\\n" "${RALPH_HARNESS_IN_AGENT:-script}" '
            + f'"${{{BACKGROUND_CEILING}-absent}}" >> "$RALPH_HARNESS_GH_CEILING"\n'
            + GH_STUB,
        )

    def _build_repo(self):
        self.repo.mkdir()
        self._git('init', '-q', '-b', 'main')
        self._git('config', 'user.name', 'Ralph')
        self._git('config', 'user.email', 'ralph@example.invalid')
        (self.repo / 'work.txt').write_text('start\n', encoding='utf-8')
        # Som repots egen: installationen ligger utanför git.
        (self.repo / '.gitignore').write_text('node_modules/\n', encoding='utf-8')

        ralph = self.repo / 'ralph'
        ralph.mkdir()
        for source in [*shell_scripts(), PROMPT, RALPH / '.gitignore']:
            shutil.copy2(source, ralph / source.name)

        # Notisen stubbas så att begäran syns medan ingenting går ut på nätet. Dess
        # egen väg mäts för sig.
        notify = ralph / 'notify.py'
        notify.write_text(
            '#!/bin/bash\n'
            # Argumenten skrivs med en avgränsare som ingen rubrik eller rad bär, så
            # att testet kan läsa larmflaggan, rubriken och raden var för sig.
            'printf "notify %s\\n" "$(printf "%s|" "$@")" >> "$RALPH_HARNESS_CALLS"\n'
            'exit "${RALPH_HARNESS_NOTIFY_RC:-0}"\n',
            encoding='utf-8',
        )
        notify.chmod(0o755)

        # Förkontrollen frågar bara efter katalogen, så en tom duger.
        (self.repo / 'node_modules' / 'playwright').mkdir(parents=True)

        self._git('add', '-A')
        self._git('commit', '-q', '-m', 'Första committen')
        self._git('checkout', '-q', '-b', WORK_BRANCH)

        remote = self.root / 'github.git'
        subprocess.run(['git', 'init', '-q', '--bare', str(remote)], check=True)
        self._git('remote', 'add', 'origin', str(remote))

    # --- Inställningar ----------------------------------------------------

    def set_frontier(self, tickets):
        self.issues.write_text(json.dumps(tickets), encoding='utf-8')
        for each in tickets:
            (self.state / str(each['number'])).write_text('OPEN', encoding='utf-8')

    def set_agent(self, script):
        self.script.write_text(f'#!/bin/bash\n{script}\n', encoding='utf-8')

    def switch_branch(self, name):
        self._git('checkout', '-q', '-b', name)

    def go_to(self, name):
        """Ställ repot på en gren som redan finns, eller skapa den från HEAD."""
        if name in self.branches():
            self._git('checkout', '-q', name)
        else:
            self.switch_branch(name)

    def detach_head(self):
        self._git('checkout', '-q', '--detach')

    def add_broken_push_url(self):
        """En andra push-URL som inte svarar, till exempel en omonterad backupdisk.

        Den riktiga URL:en läggs till först, eftersom en `pushurl` ersätter `url`
        för pushar.
        """
        working = self._git('remote', 'get-url', 'origin').stdout.strip()
        self._git('remote', 'set-url', '--add', '--push', 'origin', working)
        broken = str(self.root / 'svarar-inte' / 'Driftplanering.git')
        self._git('remote', 'set-url', '--add', '--push', 'origin', broken)
        return broken

    def remove_notify_script(self):
        """Committas, eftersom varvet annars vägrar starta på en smutsig arbetskopia."""
        (self.repo / 'ralph' / 'notify.py').unlink()
        self._git('add', '-A')
        self._git('commit', '-q', '-m', 'utan notisskript')

    def make_dirty(self):
        (self.repo / 'unexpected.txt').write_text('skräp\n', encoding='utf-8')

    # --- Körning ----------------------------------------------------------

    def _env(self, extra=None):
        # Varje ärvd RALPH_* rensas på prefixet, innan harnessets egna sätts. afk.sh
        # exporterar RALPH_RUN_FILE till agenten, och körs sviten inifrån ett pass hade
        # harnessets pass annars skrivit i det riktiga passets körningsfil. I Leffe blev
        # det 736 block i en fil som skulle bära två. Taket rensas också, så att en
        # inställning i skalprofilen inte gör spärren grön av fel skäl.
        env = {
            name: value
            for name, value in os.environ.items()
            if not name.startswith('RALPH_') and name != BACKGROUND_CEILING
        }
        env['PATH'] = f'{self.bin}:{env["PATH"]}'
        env['RALPH_HARNESS_CALLS'] = str(self.call_log)
        env['RALPH_HARNESS_CLAUDE_ARGV'] = str(self.claude_argv)
        env['RALPH_HARNESS_CLAUDE_ENV'] = str(self.claude_env)
        env['RALPH_HARNESS_GH_CEILING'] = str(self.gh_ceiling)
        env['RALPH_HARNESS_AGENT'] = str(self.script)
        env['RALPH_HARNESS_ISSUES'] = str(self.issues)
        env['RALPH_HARNESS_STATE'] = str(self.state)
        # Sviten mäter att ett gh-fel blir ett miljöfel, inte hur länge skriptet väntar.
        env['RALPH_RETRY_DELAY'] = '0'
        env.update(extra or {})
        return env

    def run_once(self, *, extra=None, track=TRACK, without=()):
        env = self._env(extra)
        if without:
            env['PATH'] = self._path_without(env['PATH'], without)
        return subprocess.run(
            ['bash', str(self.repo / 'ralph' / 'once.sh'), '', track],
            capture_output=True, text=True, env=env, cwd=self.repo,
        )

    def _path_without(self, path, commands):
        """PATH utan de kataloger som bär något av kommandona.

        Det varvet behöver och som kunde ha legat bredvid, `git` och `jq`, länkas in
        i en egen katalog först, så att det som saknas är just kommandona.
        """
        kept = self.root / 'kept-tools'
        kept.mkdir(exist_ok=True)
        for tool in ('git', 'jq'):
            found = shutil.which(tool, path=path)
            assert found, f'{tool} saknas på PATH'
            link = kept / tool
            if not link.exists():
                link.symlink_to(found)
        entries = [
            entry for entry in path.split(os.pathsep)
            if entry and not any((Path(entry) / command).exists() for command in commands)
        ]
        narrowed = os.pathsep.join([str(kept), *entries])
        for command in commands:
            assert shutil.which(command, path=narrowed) is None, command
        return narrowed

    def _afk_command(self, iterations, track):
        command = ['bash', str(self.repo / 'ralph' / 'afk.sh'), str(iterations)]
        return command + [track] if track else command

    def run_afk(self, iterations, *, extra=None, track=TRACK):
        return subprocess.run(
            self._afk_command(iterations, track),
            capture_output=True, text=True, env=self._env(extra), cwd=self.repo,
        )

    def start_afk(self, iterations, *, track=TRACK):
        """Passet som en process testet kan döda, i en egen processgrupp."""
        return subprocess.Popen(
            self._afk_command(iterations, track),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            env=self._env(), cwd=self.repo, start_new_session=True,
        )

    # --- Avläsning --------------------------------------------------------

    def calls(self):
        """Stubbarnas anrop i den ordning de skedde."""
        lines = self.call_log.read_text(encoding='utf-8').splitlines()
        return [line for line in lines if line.strip()]

    def agent_runs(self):
        return [line[len('claude '):] for line in self.calls() if line.startswith('claude ')]

    def notifications(self):
        """Beskeden passet skickade, som (rubrik, rad, larm)."""
        sent = []
        for line in self.calls():
            if not line.startswith('notify '):
                continue
            arguments = [a for a in line[len('notify '):].split('|') if a != '']
            alarm = arguments and arguments[0] == '--alarm'
            if alarm:
                arguments = arguments[1:]
            heading, text = (arguments + ['', ''])[:2]
            sent.append(Notice(heading, text, bool(alarm)))
        return sent

    def claude_arguments(self):
        return [a for a in self.claude_argv.read_bytes().decode('utf-8').split('\0') if a]

    def claude_environment(self):
        raw = self.claude_env.read_bytes().decode('utf-8')
        return dict(entry.split('=', 1) for entry in raw.split('\0') if '=' in entry)

    def gh_and_ceiling(self):
        """Varje gh-anrop som (vem, takets värde)."""
        if not self.gh_ceiling.exists():
            return []
        lines = self.gh_ceiling.read_text(encoding='utf-8').splitlines()
        return [tuple(line.split(' ', 1)) for line in lines if line.strip()]

    def head(self):
        return self._git('rev-parse', 'HEAD').stdout.strip()

    def branches(self):
        out = self._git('branch', '--format=%(refname:short)').stdout
        return sorted(
            line.strip() for line in out.splitlines()
            if line.strip() and not line.strip().startswith('(')
        )

    def current_branch(self):
        """Grenen repot står på, eller `HEAD` när den är lös, som `once.sh` läser den."""
        return self._git('rev-parse', '--abbrev-ref', 'HEAD').stdout.strip()

    def remote_branches(self):
        """Grenarna som finns på `origin`, det varvets push når."""
        url = self._git('remote', 'get-url', 'origin').stdout.strip()
        out = subprocess.run(
            ['git', 'ls-remote', '--heads', url], capture_output=True, text=True, check=True
        ).stdout
        return sorted(line.split('refs/heads/', 1)[1] for line in out.splitlines() if line.strip())

    def is_clean(self):
        return self._git('status', '--porcelain').stdout.strip() == ''

    def stashes(self):
        return [line for line in self._git('stash', 'list').stdout.splitlines() if line.strip()]

    def state_of(self, number):
        file = self.state / str(number)
        return file.read_text(encoding='utf-8').strip() if file.exists() else 'OPEN'

    def label_changes(self, number):
        """Etiketterna som begärdes för en biljett, i ordning: '+x' och '-x'."""
        file = self.state / f'{number}.labels'
        if not file.exists():
            return []
        return [line.strip() for line in file.read_text(encoding='utf-8').splitlines() if line.strip()]

    def run_files(self):
        return sorted((self.repo / 'ralph' / 'runs').glob('*.md'))

    def run_file(self):
        """Innehållet i passets enda körningsfil. Att den är en är en del av mätningen."""
        files = self.run_files()
        assert len(files) == 1, f'väntade en körningsfil, fann {files}'
        return files[0].read_text(encoding='utf-8')
