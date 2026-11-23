"""Ralph-loopens skript, körda oförändrade — ett undantag från testsömmen.

Loopen är inget sidan gör. Den kör på Macen och består av samspelet mellan
`ralph/once.sh`, `ralph/afk.sh` och `gh` (beslut 50). Testerna kör de riktiga skripten i
ett temporärt git-repo med stubbar för `claude` och `gh`, se `ralph_harness.py`, och läser
av vad som hände: vilka biljetter agenten fick, vad som ligger i git och i
körningsfilen, och vad passet gjorde med utfallet. Larmet körs för sig mot en `Ntfy`
i en tråd.

Vad en riktig agent gör med `/biljett` når sviten inte. Det prövas i ett skarpt pass.
Texten i `/biljett` läses däremot, medvetet: stegens ordning och kommandona agenten
får är det enda av arbetsordningen en test når.

Portade från photo_manager (`tests/test_ralph.py`). Körs med
`python3 -m pytest verktyg/test/ralph`, och är inte en del av `npm test`.
"""

import fnmatch
import os
import re
import shutil
import signal
import subprocess
from pathlib import Path

import pytest

from conftest import REPO_ROOT, Ntfy, waiting
from ralph_harness import (
    AFK,
    BACKGROUND_CEILING,
    COMMAND_CEILING,
    DESIGN,
    ENDS_MIDWAY,
    ENDS_MIDWAY_AFTER_COMMIT,
    FULL_TURN,
    FULL_TURN_WITH_PUSH,
    GROWS,
    HANGS,
    INTERRUPTED,
    LEAVES_IT_OPEN,
    ONCE,
    PROMPT,
    PURE_STALL,
    RALPH,
    SHRINKS,
    TICKET_COMMAND,
    TRACK,
    TURN_WITHOUT_MARKER,
    WORK_BRANCH,
    RalphRepo,
    outcome_code,
    shell_scripts,
    ticket,
    turn_that_rewrites,
)

NOTIFY = RALPH / 'notify.py'

pytestmark = pytest.mark.skipif(
    subprocess.run(['which', 'jq'], capture_output=True).returncode != 0,
    reason='jq saknas, och frontierns filter körs på riktigt',
)


@pytest.fixture
def ralph(tmp_path):
    return RalphRepo(tmp_path)


def statements_of(path):
    """Skriptets rader från första satsen till sista, utan kommentarerna i kanterna."""
    lines = path.read_text(encoding='utf-8').splitlines()
    assert lines[0].startswith('#!'), f'{path.name} saknar shebang'

    def is_filler(line):
        return not line.strip() or line.lstrip().startswith('#')

    rest = lines[1:]
    while rest and is_filler(rest[0]):
        rest.pop(0)
    while rest and is_filler(rest[-1]):
        rest.pop()
    return rest


def longest_command_ms():
    """Hur länge ett kommando får köra i förgrunden, som `once.sh` säger det."""
    return int(re.search(r'(?m)^LONGEST_COMMAND_MS=(\d+)$', ONCE.read_text(encoding='utf-8')).group(1))


def wall_time(seconds):
    """Väggtiden som `afk.sh` skriver den, körd ur skriptet och inte skriven av."""
    source = AFK.read_text(encoding='utf-8')
    start = source.index('wall_time() {')
    function = source[start:source.index('\n}\n', start) + len('\n}\n')]
    result = subprocess.run(
        ['bash', '-c', f'{function}wall_time {seconds}'], capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def only_notice(ralph):
    """Passets enda besked. Att det är ett är en del av mätningen."""
    sent = ralph.notifications()
    assert len(sent) == 1, f'väntade ett besked, fick {sent}'
    return sent[0]


def last_two_lines(output):
    """Passets sista två rader med innehåll, som är beskedet."""
    lines = [line for line in output.splitlines() if line.strip()]
    return lines[-2:]


def code_of(path):
    """Skriptet utan sina kommentarrader, eftersom förklaringarna nämner det de varnar för."""
    lines = path.read_text(encoding='utf-8').splitlines()
    return '\n'.join(line for line in lines if not line.lstrip().startswith('#'))


# ============================================================
# Varvet
# ============================================================

def test_a_successful_turn_closes_the_ticket_and_stays_on_the_branch(ralph):
    result = ralph.run_once()

    assert result.returncode == outcome_code('DONE'), result.stdout + result.stderr
    assert ralph.state_of(42) == 'CLOSED'
    assert ralph.current_branch() == WORK_BRANCH
    assert ralph.branches() == sorted(['main', WORK_BRANCH]), 'varvet skapar inga grenar'
    assert ralph.is_clean(), 'nästa varv vägrar starta på en smutsig arbetskopia'
    assert 'Klart: #42 stängd' in result.stdout


def test_a_successful_turn_leaves_main_where_it_was(ralph):
    """Det som förs in i main går via pull request, och varvet rör den inte (beslut 50)."""
    main_before = ralph._git('rev-parse', 'main').stdout.strip()
    ralph.set_agent(FULL_TURN_WITH_PUSH)

    ralph.run_once()

    assert ralph._git('rev-parse', 'main').stdout.strip() == main_before
    assert ralph.head() != main_before
    assert ralph.remote_branches() == [WORK_BRANCH]


def test_a_ticket_closed_without_a_commit_is_a_done_turn(ralph):
    """Stängd biljett är kriteriet: ett varv kan verifiera det som redan låg på arbetsgrenen."""
    ralph.set_agent('gh issue close "$RALPH_HARNESS_TICKET" --comment "fanns redan"')

    result = ralph.run_once()

    assert result.returncode == outcome_code('DONE'), result.stdout
    assert 'verifieringsvarv' in result.stdout


def test_the_prompt_is_exactly_the_command_with_the_tickets_number(ralph):
    """Text efter numret hade följt med in i kommandots argument."""
    ralph.set_frontier([ticket(77)])

    ralph.run_once()

    assert ralph.claude_arguments()[-1] == '/biljett 77'


def test_the_loops_own_rules_go_as_a_system_prompt(ralph):
    ralph.run_once()

    arguments = ralph.claude_arguments()
    sent = arguments[arguments.index('--append-system-prompt') + 1]
    assert sent == PROMPT.read_text(encoding='utf-8').strip()


def denied_tools(ralph):
    """Värdena till `--disallowedTools`, fram till nästa flagga."""
    arguments = ralph.claude_arguments()
    start = arguments.index('--disallowedTools') + 1
    denied = []
    for argument in arguments[start:]:
        if argument.startswith('--'):
            break
        denied.append(argument)
    return denied


def is_denied(command, denied):
    """Om ett Bash-kommando faller under något av mönstren, läst som glob."""
    patterns = [re.fullmatch(r'Bash\((.*)\)', each).group(1) for each in denied]
    return any(fnmatch.fnmatchcase(command, pattern) for pattern in patterns)


def test_pushing_to_main_and_merging_are_denied_on_the_call_without_swallowing_the_prompt(ralph):
    """`--disallowedTools` tar flera värden, och hade kunnat äta prompten."""
    ralph.run_once()

    denied = denied_tools(ralph)

    assert '/biljett 42' not in denied
    for pattern in ('Bash(git push*main*)', 'Bash(git push*master*)', 'Bash(gh pr merge*)'):
        assert pattern in denied, f'{pattern} är inte nekat: {denied}'


@pytest.mark.parametrize('command, denied', [
    ('git push origin main', True),
    ('git push origin HEAD:main', True),
    ('git push -u origin master', True),
    ('gh pr merge 12 --squash', True),
    ('git push origin HEAD', False),
    ('git push', False),
], ids=lambda value: str(value))
def test_the_denied_patterns_stop_main_and_let_the_work_branch_through(ralph, command, denied):
    """Pushen `/biljett` föreskriver ska gå igenom, och den till main ska inte."""
    ralph.run_once()

    assert is_denied(command, denied_tools(ralph)) is denied


def test_the_scripts_themselves_never_push_or_merge(ralph):
    """Pushen är agentens, till arbetsgrenen. Skripten bara frågar om den kom fram."""
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(FULL_TURN_WITH_PUSH)

    ralph.run_afk(2)

    assert [call for call in ralph.calls() if call.startswith('gh pr')] == []
    assert ralph.remote_branches() == [WORK_BRANCH]
    for script in (ONCE, AFK):
        # Mönstren i DENIED_TOOLS stavar kommandona för att neka dem, och räknas inte.
        code = '\n'.join(line for line in code_of(script).splitlines() if '"Bash(' not in line)
        assert 'git push' not in code, script.name
        assert 'gh pr' not in code, script.name


def test_claude_does_not_cap_the_agents_background_jobs(ralph):
    """`claude --print` dödar annars granskarna 600 s efter turen, och varvet blir utan commit."""
    ralph.run_once()

    assert ralph.claude_environment().get(BACKGROUND_CEILING) == '0'


def test_an_inherited_background_ceiling_is_overwritten(ralph):
    ralph.run_once(extra={BACKGROUND_CEILING: '600000'})

    assert ralph.claude_environment().get(BACKGROUND_CEILING) == '0'


def test_the_background_ceiling_is_not_exported(ralph):
    """Den sätts på `claude`-anropet och gäller ingenting annat skriptet kör."""
    ralph.run_once()

    by_script = [ceiling for who, ceiling in ralph.gh_and_ceiling() if who == 'script']
    by_agent = [ceiling for who, ceiling in ralph.gh_and_ceiling() if who == 'agent']
    assert len(by_script) >= 2 and by_agent, ralph.gh_and_ceiling()
    assert set(by_script) == {'absent'}
    assert set(by_agent) == {'0'}


def test_a_command_as_long_as_the_suite_stays_in_the_foreground(ralph):
    """Bash-verktyget flyttar annars sviten till bakgrunden efter tio minuter, och där dör den med turen."""
    ralph.run_once()

    assert ralph.claude_environment().get(COMMAND_CEILING) == str(longest_command_ms())


# ============================================================
# Frontiern och spåret
# ============================================================

def test_a_blocked_ticket_is_skipped_and_a_closed_blocker_is_not_a_blocker(ralph):
    ralph.set_frontier([ticket(5, blockers=('OPEN',)), ticket(9, blockers=('CLOSED',))])

    ralph.run_once()

    assert ralph.agent_runs() == ['/biljett 9']


def test_the_lowest_number_goes_first(ralph):
    ralph.set_frontier([ticket(9), ticket(5)])

    ralph.run_once()

    assert ralph.agent_runs() == ['/biljett 5']


def test_a_chain_is_released_as_its_blockers_close(ralph):
    """Så går en serie: stängningen är det som släpper nästa biljett (beslut 50)."""
    ralph.set_agent(
        FULL_TURN + (
            '\npython3 - <<PY\n'
            'import json, os\n'
            'path = os.environ["RALPH_HARNESS_ISSUES"]\n'
            'issues = json.load(open(path))\n'
            'for issue in issues:\n'
            '    issue["blockedBy"] = {"nodes": [{"state": "CLOSED"}], "totalCount": 1}\n'
            'json.dump(issues, open(path, "w"))\n'
            'PY\n'
        )
    )
    ralph.set_frontier([ticket(1), ticket(2, blockers=('OPEN',))])

    ralph.run_afk(3)

    assert ralph.agent_runs() == ['/biljett 1', '/biljett 2']


def test_a_relabelled_ticket_is_not_picked_by_the_next_turn(ralph):
    """Bytet till `ready-for-human` är det som tar biljetten ur kön."""
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(LEAVES_IT_OPEN)

    ralph.run_once()
    ralph.run_once()

    assert ralph.agent_runs() == ['/biljett 42', '/biljett 43']


def test_the_track_narrows_the_frontier_and_does_not_replace_the_label(ralph):
    """#44 bär spåret men är inte färdigspecad, och #42 är specad men utanför spåret."""
    ralph.set_frontier([
        ticket(42, labels=['ready-for-agent']),
        ticket(44, labels=['etapp-5']),
        ticket(45, labels=['ready-for-agent', 'etapp-5']),
    ])

    ralph.run_afk(1, track='etapp-5')

    assert ralph.agent_runs() == ['/biljett 45']


def test_the_turn_refuses_to_run_without_a_track(ralph):
    """Lägsta numret i hela kön är inte körordningen (beslut 50)."""
    result = ralph.run_once(track='')

    assert result.returncode == outcome_code('ENV_ERROR'), result.stdout
    assert ralph.agent_runs() == []


def test_the_pass_refuses_to_start_without_a_track(ralph):
    result = ralph.run_afk(3, track=None)

    assert result.returncode != 0
    assert 'Användning' in result.stdout
    assert ralph.notifications() == [], 'ett anrop utan spår är inget pass att ge besked om'
    assert ralph.agent_runs() == []


def test_a_track_without_tickets_is_an_empty_queue_and_not_an_error(ralph):
    result = ralph.run_afk(2, track='finns-inte')

    assert result.returncode == 0, result.stdout
    assert 'NO MORE TASKS' in result.stdout
    assert [notice.heading for notice in ralph.notifications()] == ['Rent stall']


# ============================================================
# Förkontrollerna
# ============================================================

def test_a_dirty_tree_is_refused(ralph):
    ralph.make_dirty()

    result = ralph.run_once()

    assert result.returncode == outcome_code('ENV_ERROR')
    assert 'arbetskopian är inte ren' in result.stdout
    assert ralph.agent_runs() == []


def test_a_missing_playwright_is_refused(ralph):
    """Sviten är webbläsartester i Playwright, och utan installationen kan inget varv bli klart."""
    shutil.rmtree(ralph.repo / 'node_modules' / 'playwright')

    result = ralph.run_once()

    assert result.returncode == outcome_code('ENV_ERROR')
    assert 'node_modules/playwright' in result.stdout
    assert 'npm install' in result.stdout, 'felet säger hur det lagas'
    assert ralph.agent_runs() == []
    assert ralph.label_changes(42) == []


def test_a_missing_node_is_refused(ralph):
    result = ralph.run_once(without=('node',))

    assert result.returncode == outcome_code('ENV_ERROR'), result.stdout + result.stderr
    assert 'node saknas' in result.stdout
    assert ralph.agent_runs() == []


@pytest.mark.parametrize('branch', ['main', 'master'])
def test_a_turn_on_main_is_refused_and_leaves_the_ticket_alone(ralph, branch):
    """Ett varv på main hade pushat direkt dit, och det går via pull request (beslut 50)."""
    ralph.go_to(branch)

    result = ralph.run_once()

    assert result.returncode == outcome_code('ENV_ERROR'), result.stdout
    assert f"står på '{branch}'" in result.stdout
    assert 'git switch' in result.stdout, 'felet säger hur det lagas'
    assert ralph.agent_runs() == []
    assert ralph.state_of(42) == 'OPEN'
    assert ralph.label_changes(42) == []
    assert ralph.current_branch() == branch, 'varvet byter inte gren själv'
    assert ralph.remote_branches() == []


def test_a_turn_on_a_detached_head_is_refused(ralph):
    """En lös HEAD har ingen gren att pusha till."""
    ralph.detach_head()

    result = ralph.run_once()

    assert result.returncode == outcome_code('ENV_ERROR'), result.stdout
    assert "står på 'HEAD'" in result.stdout
    assert ralph.agent_runs() == []
    assert ralph.label_changes(42) == []


def test_a_pass_on_main_stops_at_once_with_an_alarm(ralph):
    ralph.go_to('main')

    result = ralph.run_afk(3)

    assert result.returncode == 1, result.stdout
    assert 'miljöfel' in result.stdout, 'skälet står i terminalen'
    assert ralph.agent_runs() == []
    notice = only_notice(ralph)
    assert notice.heading == 'Ralph avbruten' and notice.alarm


def test_a_work_branch_whose_name_contains_main_is_not_refused(ralph):
    """Det är grenen som jämförs, inte ett ord i dess namn."""
    ralph.switch_branch('claude/main-meny')

    result = ralph.run_once()

    assert result.returncode == outcome_code('DONE'), result.stdout


def test_github_being_down_is_an_environment_error_that_leaves_the_ticket_alone(ralph):
    result = ralph.run_afk(5, extra={'RALPH_HARNESS_GH_FAILS': '1'})

    assert result.returncode != 0
    assert ralph.label_changes(42) == []
    assert ralph.agent_runs() == []
    notice = only_notice(ralph)
    assert notice.heading == 'Ralph avbruten' and notice.alarm


# ============================================================
# Utfallen
# ============================================================

def test_an_empty_frontier_has_its_own_code(ralph):
    ralph.set_frontier([])

    result = ralph.run_once()

    assert result.returncode == outcome_code('EMPTY_QUEUE')
    assert 'NO MORE TASKS' in result.stdout


@pytest.mark.parametrize('agent', [PURE_STALL, LEAVES_IT_OPEN], ids=['utan commit', 'med commit'])
def test_an_open_ticket_is_a_stall(ralph, agent):
    ralph.set_agent(agent)

    result = ralph.run_once()

    assert result.returncode == outcome_code('STALL'), result.stdout
    assert 'NO PROGRESS' in result.stdout
    assert ralph.state_of(42) == 'OPEN'


def test_a_turn_that_ended_midway_is_an_agent_error_and_its_leftovers_are_stashed(ralph):
    """Biljetten är varken stängd eller lämnad, så agenten har inte förklarat något.

    Resterna kan vara ett färdigt arbete, och utan stashen hade nästa varv vägrat
    starta på den smutsiga arbetskopian.
    """
    ralph.set_agent(ENDS_MIDWAY)

    result = ralph.run_once()

    assert result.returncode == outcome_code('AGENT_ERROR'), result.stdout
    assert ralph.state_of(42) == 'OPEN'
    assert ralph.is_clean()
    stashes = ralph.stashes()
    assert len(stashes) == 1 and 'ralph: avbrutet varv #42' in stashes[0]


def test_a_turn_that_ended_midway_after_its_commit_is_a_stall(ralph):
    """Ingen vet hur långt committen kom, så nästa agent ska inte bygga vidare på den."""
    ralph.set_agent(ENDS_MIDWAY_AFTER_COMMIT)

    result = ralph.run_once()

    assert result.returncode == outcome_code('STALL'), result.stdout
    assert 'Commit gjord' in result.stdout
    assert ralph.is_clean()
    assert len(ralph.stashes()) == 1


def test_a_nonzero_agent_is_an_agent_error_and_its_leftovers_are_stashed(ralph):
    """Ett API-fel kan träffa en sekund före committen, så resterna kastas inte."""
    ralph.set_agent(INTERRUPTED)

    result = ralph.run_once()

    assert result.returncode == outcome_code('AGENT_ERROR'), result.stdout
    assert ralph.is_clean()
    stashes = ralph.stashes()
    assert len(stashes) == 1 and 'ralph: avbrutet varv #42' in stashes[0]


def test_a_closed_ticket_with_a_nonzero_agent_is_not_done(ralph):
    """Agenten kan ha stängt med arbetet halvgjort."""
    ralph.set_agent('gh issue close "$RALPH_HARNESS_TICKET" --comment klart\nexit 1')

    result = ralph.run_once()

    assert result.returncode == outcome_code('AGENT_ERROR'), result.stdout
    assert 'Kontrollera resultatet' in result.stdout


def test_a_turn_over_the_limit_is_a_stall_and_keeps_what_it_wrote(ralph):
    """Inget omförsök: ett varv som hängt en gång gör det troligen igen, och kostar timmar."""
    ralph.set_agent(HANGS)

    result = ralph.run_once(extra={'RALPH_TURN_LIMIT': '2'})

    assert result.returncode == outcome_code('STALL'), result.stdout
    assert 'tidsgräns' in result.stdout
    assert ralph.is_clean()
    assert len(ralph.stashes()) == 1


def test_a_turn_under_the_limit_is_left_alone(ralph):
    result = ralph.run_once(extra={'RALPH_TURN_LIMIT': '120'})

    assert result.returncode == outcome_code('DONE'), result.stdout


# ============================================================
# Passet
# ============================================================

def test_successful_turns_roll_on_without_an_alarm(ralph):
    ralph.set_frontier([ticket(42), ticket(43)])

    result = ralph.run_afk(2)

    assert result.returncode == 0, result.stdout
    assert ralph.state_of(42) == ralph.state_of(43) == 'CLOSED'
    notice = only_notice(ralph)
    assert notice.heading == 'Rent stall' and not notice.alarm


def test_an_empty_queue_ends_the_pass_cleanly(ralph):
    result = ralph.run_afk(3)

    assert result.returncode == 0, result.stdout
    assert 'kön är tom efter 2 iterationer' in result.stdout
    notice = only_notice(ralph)
    assert notice.heading == 'Rent stall' and not notice.alarm


def test_a_stall_stops_the_pass_and_raises_the_alarm(ralph):
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(PURE_STALL)

    result = ralph.run_afk(5)

    assert result.returncode != 0
    assert ralph.agent_runs() == ['/biljett 42']
    assert 'rent stall' in result.stdout, 'skälet står i terminalen'
    notice = only_notice(ralph)
    assert notice.heading == 'Ralph avbruten' and notice.alarm


def test_an_agent_error_gets_exactly_one_retry(ralph):
    ralph.set_agent(INTERRUPTED)

    result = ralph.run_afk(5)

    assert result.returncode != 0
    assert ralph.agent_runs() == ['/biljett 42', '/biljett 42']
    assert only_notice(ralph).heading == 'Ralph avbruten'


def test_a_turn_that_ended_midway_gets_the_same_ticket_once_more(ralph):
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(
        'if [ ! -f "$RALPH_HARNESS_STATE/first" ]; then\n'
        '  touch "$RALPH_HARNESS_STATE/first"\n'
        + ENDS_MIDWAY +
        '  exit 0\n'
        'fi\n' + FULL_TURN
    )

    result = ralph.run_afk(2)

    assert result.returncode == 0, result.stdout
    assert ralph.agent_runs() == ['/biljett 42', '/biljett 42']
    assert ralph.state_of(42) == 'CLOSED'
    assert only_notice(ralph).heading == 'Rent stall'


def test_a_turn_that_keeps_ending_midway_stops_the_pass(ralph):
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(ENDS_MIDWAY)

    result = ralph.run_afk(5)

    assert result.returncode != 0
    assert ralph.agent_runs() == ['/biljett 42', '/biljett 42']
    assert only_notice(ralph).heading == 'Ralph avbruten'
    assert 'upprepat agentfel' in result.stdout, 'skälet står i terminalen'


def test_a_turn_that_ended_midway_after_its_commit_gets_no_retry(ralph):
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(ENDS_MIDWAY_AFTER_COMMIT)

    result = ralph.run_afk(5)

    assert result.returncode != 0
    assert ralph.agent_runs() == ['/biljett 42']
    assert only_notice(ralph).heading == 'Ralph avbruten'


def test_the_retry_count_starts_over_after_a_successful_turn(ralph):
    """Räknaren mäter ett avbrotts envishet, inte passets längd."""
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(
        'if [ ! -f "$RALPH_HARNESS_STATE/first" ]; then\n'
        '  touch "$RALPH_HARNESS_STATE/first"\n'
        '  exit 1\n'
        'fi\n' + FULL_TURN
    )

    result = ralph.run_afk(4)

    assert result.returncode == 0, result.stdout
    assert ralph.state_of(42) == ralph.state_of(43) == 'CLOSED'
    assert only_notice(ralph).heading == 'Rent stall'


def test_the_reason_stands_when_the_alarm_did_not_get_through(ralph):
    ralph.set_agent(PURE_STALL)

    result = ralph.run_afk(5, extra={'RALPH_HARNESS_NOTIFY_RC': '1'})

    assert result.returncode != 0
    assert 'rent stall' in result.stdout
    assert 'Ralph avbruten' in result.stdout
    assert 'notisen gick inte fram' in result.stdout


def test_the_reason_stands_when_the_alarm_script_is_missing(ralph):
    ralph.remove_notify_script()
    ralph.set_agent(PURE_STALL)

    result = ralph.run_afk(5)

    assert result.returncode != 0
    assert 'rent stall' in result.stdout
    assert 'Ralph avbruten' in result.stdout
    assert 'ingen notis skickad' in result.stdout


def test_a_pass_that_went_well_also_says_so_when_the_notice_did_not_get_through(ralph):
    """Exitkoderna är oförändrade, så kedjan av pass fungerar som förut."""
    result = ralph.run_afk(1, extra={'RALPH_HARNESS_NOTIFY_RC': '1'})

    assert result.returncode == 0, result.stdout
    assert 'Rent stall' in result.stdout
    assert 'notisen gick inte fram' in result.stdout


# ============================================================
# Passets besked
# ============================================================

def test_a_pass_that_emptied_the_queue_says_what_it_implemented_and_how_long_it_took(ralph):
    ralph.set_frontier([ticket(42), ticket(43)])

    result = ralph.run_afk(5)

    notice = only_notice(ralph)
    assert notice.heading == 'Rent stall'
    assert re.fullmatch(r'2 biljetter implementerade på \d+m\.', notice.line), notice.line
    assert last_two_lines(result.stdout) == [notice.heading, notice.line]


def test_a_pass_that_used_all_its_iterations_says_the_same_thing(ralph):
    """Båda vägarna ut är ett pass som gick bra, och de säger samma sak."""
    ralph.set_frontier([ticket(42), ticket(43), ticket(44)])

    result = ralph.run_afk(2)

    notice = only_notice(ralph)
    assert notice.heading == 'Rent stall'
    assert notice.line.startswith('2 biljetter implementerade på ')
    assert last_two_lines(result.stdout) == [notice.heading, notice.line]


def test_one_implemented_ticket_is_inflected_in_the_singular(ralph):
    ralph.run_afk(1)

    assert only_notice(ralph).line.startswith('1 biljett implementerad på ')


def test_a_pass_that_implemented_nothing_says_zero_in_the_plural(ralph):
    ralph.set_frontier([])

    ralph.run_afk(1)

    assert only_notice(ralph).line.startswith('0 biljetter implementerade på ')


@pytest.mark.parametrize('seconds, written', [
    (4 * 3600 + 35 * 60, '4h 35m'),
    (42 * 60, '42m'),
    (3600, '1h 0m'),
    (30, '0m'),
])
def test_the_wall_time_is_written_in_hours_and_minutes(seconds, written):
    """Under en timme skrivs tiden bara som minuter."""
    assert wall_time(seconds) == written


@pytest.mark.parametrize('created, sentence', [
    (1, '1 biljett skapades.'),
    (2, '2 biljetter skapades.'),
], ids=['en', 'två'])
def test_tickets_created_while_the_pass_ran_are_counted_and_inflected(ralph, created, sentence):
    """En biljett Andreas själv skapar under samma tid räknas med, och det godtas."""
    writes = '\n'.join(
        f'gh issue create --label needs-triage --title "Ett fynd {each}"'
        for each in range(created)
    )
    ralph.set_agent(writes + '\n' + FULL_TURN)

    ralph.run_afk(1)

    assert only_notice(ralph).line.endswith(sentence)


def test_a_pass_that_created_no_ticket_leaves_the_sentence_out(ralph):
    ralph.run_afk(1)

    assert 'skapades' not in only_notice(ralph).line


def test_a_pass_that_stopped_says_where_it_stopped_and_not_why(ralph):
    """Skälet står kvar i körningsfilen, och det är där Claude läser det."""
    ralph.set_frontier([ticket(42), ticket(43), ticket(44)])
    # Varv ett blir klart, varv två stannar: filen läggs av det första varvet.
    ralph.set_agent(
        'if [ -f "$RALPH_HARNESS_STATE/done_one" ]; then\n'
        + PURE_STALL +
        '  exit 0\n'
        'fi\n'
        'touch "$RALPH_HARNESS_STATE/done_one"\n'
        + FULL_TURN
    )

    result = ralph.run_afk(5)

    notice = only_notice(ralph)
    assert notice.heading == 'Ralph avbruten' and notice.alarm
    assert notice.line == '1 biljett implementerad. Avbrott vid biljett 2 av 3 i loopen.'
    assert 'stall' not in notice.line
    assert last_two_lines(result.stdout) == [notice.heading, notice.line]


@pytest.mark.parametrize('agent, extra', [
    (PURE_STALL, {}),
    (ENDS_MIDWAY, {}),
    (HANGS, {'RALPH_TURN_LIMIT': '2'}),
    (None, {'RALPH_HARNESS_GH_FAILS': '1'}),
], ids=['stall', 'upprepat agentfel', 'tidsgräns', 'miljöfel'])
def test_every_way_a_pass_stops_gives_the_same_heading(ralph, agent, extra):
    if agent is not None:
        ralph.set_agent(agent)

    result = ralph.run_afk(3, extra=extra)

    assert result.returncode == 1, result.stdout
    notice = only_notice(ralph)
    assert notice.heading == 'Ralph avbruten' and notice.alarm


def test_an_unknown_outcome_also_gives_ralph_avbruten(ralph):
    """En kod once.sh inte definierar är i sig ett fel att titta på.

    Koderna står kvar i filen, eftersom afk.sh läser dem därifrån och annars inte
    kommer igång. Det som ändras är vad varvet svarar med.
    """
    once = ralph.repo / 'ralph' / 'once.sh'
    codes = [line for line in once.read_text(encoding='utf-8').splitlines()
             if line.startswith('OUTCOME_')]
    once.write_text('#!/bin/bash\n{\n' + '\n'.join(codes) + '\nexit 99\n}\n', encoding='utf-8')

    result = ralph.run_afk(3)

    assert result.returncode == 1, result.stdout
    notice = only_notice(ralph)
    assert notice.heading == 'Ralph avbruten' and notice.alarm
    assert notice.line == '0 biljetter implementerade. Avbrott vid biljett 1 av 1 i loopen.'


def test_the_expected_count_is_never_more_than_the_iterations(ralph):
    """Ett pass tar inte fler varv än det har, hur lång kön än är."""
    ralph.set_frontier([ticket(number) for number in range(42, 50)])
    ralph.set_agent(PURE_STALL)

    ralph.run_afk(2)

    assert only_notice(ralph).line.endswith('Avbrott vid biljett 1 av 2 i loopen.')


def test_the_expected_count_is_the_queue_when_it_is_shorter_than_the_iterations(ralph):
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(PURE_STALL)

    ralph.run_afk(9)

    assert only_notice(ralph).line.endswith('Avbrott vid biljett 1 av 2 i loopen.')


def test_the_expected_count_leaves_out_a_blocked_ticket(ralph):
    """N är vad passet kunde ta, och en blockerad biljett kan det inte."""
    ralph.set_frontier([
        ticket(42),
        ticket(43, blockers=('OPEN',)),
        ticket(44, blockers=('CLOSED',)),
    ])
    ralph.set_agent(PURE_STALL)

    ralph.run_afk(9)

    assert only_notice(ralph).line.endswith('Avbrott vid biljett 1 av 2 i loopen.')


def test_a_count_that_could_not_be_read_is_left_out_rather_than_guessed(ralph):
    """GitHub nere är det vanligaste skälet att ett pass stannar på varv ett."""
    result = ralph.run_afk(3, extra={'RALPH_HARNESS_GH_FAILS': '1'})

    assert result.returncode == 1, result.stdout
    notice = only_notice(ralph)
    assert notice.line == '0 biljetter implementerade. Avbrott vid biljett 1 av ? i loopen.'


def test_the_expected_count_only_counts_tickets_in_the_track(ralph):
    """Kön är spårets kö, och en biljett i ett annat spår hör inte till passet."""
    ralph.set_frontier([
        ticket(42),
        ticket(43, labels=['ready-for-agent', 'annat-spår']),
        ticket(44, labels=['needs-triage', TRACK]),
    ])
    ralph.set_agent(PURE_STALL)

    ralph.run_afk(9)

    assert only_notice(ralph).line.endswith('Avbrott vid biljett 1 av 1 i loopen.')


# ============================================================
# Körningsfilen
# ============================================================

def test_the_block_carries_ticket_title_outcome_and_summary(ralph):
    ralph.set_frontier([ticket(77, title='Något som gjordes')])

    ralph.run_afk(1)

    text = ralph.run_file()
    for expected in ('#77', 'Något som gjordes', 'KLART', 'Testerna gröna.', 'Osäker på: ingenting.'):
        assert expected in text


def test_the_block_carries_the_summary_and_not_the_whole_output(ralph):
    ralph.set_agent('echo "en rad arbete"\n' + FULL_TURN)

    ralph.run_afk(1)

    assert 'en rad arbete' not in ralph.run_file()


def test_a_missing_marker_does_not_silence_the_summary(ralph):
    """Blocket bär utdatans svans och säger att markören saknades."""
    ralph.set_agent(TURN_WITHOUT_MARKER)

    ralph.run_afk(1)

    text = ralph.run_file()
    assert 'En sammanfattning utan markör ovanför sig.' in text
    assert 'RALPH SAMMANFATTNING' in text


def test_one_block_per_turn_in_one_file_that_leaves_the_tree_clean(ralph):
    """Passets eget spår får inte vara det som spärrar nästa varv."""
    ralph.set_frontier([ticket(42), ticket(43)])

    ralph.run_afk(2)

    text = ralph.run_file()
    assert len(re.findall(r'(?m)^## ', text)) == 2, text
    assert ralph.state_of(43) == 'CLOSED'
    assert ralph.is_clean()


def test_a_turn_that_stopped_also_gets_a_block(ralph):
    ralph.set_agent(PURE_STALL)

    ralph.run_afk(3)

    text = ralph.run_file()
    assert 'STALL' in text
    assert 'Kriteriet kräver en människa.' in text


def test_a_killed_pass_still_carries_the_turns_that_finished(ralph):
    """Därför skrivs blocken löpande, och bara ett dödat pass skiljer det från ett slut."""
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(
        'if [ -f "$RALPH_HARNESS_STATE/first_done" ]; then\n'
        '  sleep 120\n'
        'fi\n'
        'touch "$RALPH_HARNESS_STATE/first_done"\n' + FULL_TURN
    )

    process = ralph.start_afk(4)
    try:
        for _ in waiting(60):
            if len(ralph.agent_runs()) >= 2:
                break
            assert process.poll() is None, process.stdout.read()
        else:
            pytest.fail('varv två startade aldrig')
    finally:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        process.wait(timeout=30)
        process.stdout.close()

    text = ralph.run_file()
    assert '#42' in text and 'Testerna gröna.' in text
    assert '#43' not in text


@pytest.mark.parametrize('agent, iterations', [
    (FULL_TURN, 1),
    (PURE_STALL, 3),
    (FULL_TURN, 3),
], ids=['max iterationer', 'stall', 'tom kö'])
def test_the_run_file_is_written_to_disk_and_not_to_the_terminal(ralph, agent, iterations):
    """Hur det gick frågar Andreas Claude om, och Claude läser filen.

    Varvets egna utskrifter står kvar i terminalen medan passet kör. Det som är borta
    är dumpen av filen till sist: dess rubriker, utfallsrader och pushrader.
    """
    ralph.set_agent(agent)

    result = ralph.run_afk(iterations)

    assert str(ralph.run_files()[0]) in result.stdout, 'filen ska gå att hitta'
    blocks = [line for line in ralph.run_file().splitlines()
              if line.startswith(('## ', '# Ralph-pass', '- Utfall:', '- Push'))]
    assert blocks, ralph.run_file()
    for line in blocks:
        assert line not in result.stdout, line


def test_the_header_names_the_track(ralph):
    ralph.run_afk(1)

    assert TRACK in ralph.run_file()


def test_a_run_file_that_cannot_be_written_is_said_and_fails_nothing(ralph):
    """Annars hade utskriften sagt att inget varv blev klart, vilket hade varit osant."""
    closed = ralph.root / 'utan-skrivratt'
    closed.mkdir()
    closed.chmod(0o500)
    try:
        result = ralph.run_afk(1, extra={'RALPH_RUN_FILE': str(closed / 'pass.md')})
    finally:
        closed.chmod(0o700)

    output = result.stdout + result.stderr
    assert ralph.state_of(42) == 'CLOSED', output
    assert 'kunde inte skriva varvets block' in output
    assert 'kunde inte skriva passets huvud' in output


# ============================================================
# Pushen
# ============================================================

def test_a_push_url_that_does_not_answer_does_not_fail_the_turn(ralph):
    """Kontrollen frågar varje push-URL, och en som inte svarar är en varning och inget fel."""
    broken = ralph.add_broken_push_url()
    ralph.set_frontier([ticket(42), ticket(43)])
    ralph.set_agent(FULL_TURN_WITH_PUSH)

    result = ralph.run_afk(2)

    assert result.returncode == 0, result.stdout
    assert ralph.state_of(43) == 'CLOSED'
    assert not only_notice(ralph).alarm, 'passet larmade om en URL som inte svarade'
    text = ralph.run_file()
    assert broken in text and 'VARNING' in text


def test_a_push_that_got_through_gives_no_warning(ralph):
    ralph.set_agent(FULL_TURN_WITH_PUSH)

    ralph.run_afk(1)

    text = ralph.run_file()
    assert 'samtliga push-URL:er' in text
    assert 'VARNING' not in text


def test_the_push_check_asks_about_the_branch_the_turn_stands_on(ralph):
    ralph.switch_branch('claude/annat-spar')
    ralph.set_agent(FULL_TURN_WITH_PUSH)

    ralph.run_afk(1)

    assert 'VARNING' not in ralph.run_file()


def test_a_turn_that_did_not_push_shows(ralph):
    ralph.run_afk(1)

    assert 'VARNING' in ralph.run_file()


# ============================================================
# Att skripten skrivs om medan de kör
# ============================================================

def test_the_turn_reports_its_outcome_when_once_grows(ralph):
    ralph.set_agent(turn_that_rewrites('ralph/once.sh', GROWS))

    result = ralph.run_once()

    output = result.stdout + result.stderr
    assert result.returncode == outcome_code('DONE'), output
    assert 'Klart: #42 stängd' in output
    assert 'syntax error' not in output


def test_a_shrunken_once_does_not_give_a_silent_zero(ralph):
    """Nollan ensam duger inte som mått, utan utfallsraden måste stå där också."""
    ralph.set_agent(turn_that_rewrites('ralph/once.sh', SHRINKS))

    result = ralph.run_once()

    output = result.stdout + result.stderr
    assert result.returncode == outcome_code('DONE'), output
    assert '--- Utfall för #42 ---' in output


def test_the_pass_reports_its_outcome_when_afk_grows(ralph):
    ralph.set_agent(turn_that_rewrites('ralph/afk.sh', GROWS))

    result = ralph.run_afk(1)

    output = result.stdout + result.stderr
    assert result.returncode == 0, output
    assert 'Max iterationer' in output
    assert 'syntax error' not in output


def test_every_script_is_enclosed_and_ends_in_an_exit():
    scripts = shell_scripts()

    assert scripts, f'inga *.sh i {RALPH}'
    for script in scripts:
        statements = statements_of(script)
        assert statements[0] == '{', f'{script.name} är inte innesluten'
        assert statements[-1] == '}', f'{script.name}:s klammer stängs inte sist'
        last = [line.strip() for line in statements[:-1] if line.strip()][-1]
        assert last.startswith('exit'), f'{script.name} slutar med {last!r}'


def test_the_harness_copies_the_scripts_unchanged(ralph):
    for source in [*shell_scripts(), PROMPT]:
        assert (ralph.repo / 'ralph' / source.name).read_bytes() == source.read_bytes()


# ============================================================
# Det som ska säga samma sak på flera ställen
# ============================================================

def test_the_outcome_codes_have_one_home_and_are_unique():
    """`afk.sh` läser dem med ett radankare, så de står i kolumn noll i `once.sh`."""
    codes = re.findall(r'(?m)^OUTCOME_(\w+)=(\d+)$', ONCE.read_text(encoding='utf-8'))
    values = [value for _, value in codes]

    assert len(values) == 5, codes
    assert len(values) == len(set(values)), codes
    assert not re.search(r'(?m)^OUTCOME_\w+=\d+$', AFK.read_text(encoding='utf-8'))
    assert 'read_outcome_code' in AFK.read_text(encoding='utf-8')


def test_the_headings_have_one_home_and_are_described_where_they_are_read():
    """Rubrikerna skrivs av `afk.sh`, och texterna får inte glida isär från dem."""
    source = AFK.read_text(encoding='utf-8')
    headings = dict(re.findall(r"(?m)^HEADING_(\w+)='([^']+)'$", source))

    assert set(headings) == {'CLEAN', 'STOPPED'}, headings
    design = DESIGN.read_text(encoding='utf-8')
    notify = NOTIFY.read_text(encoding='utf-8')
    for heading in headings.values():
        assert heading in design, heading
        assert heading in notify, heading


def test_the_design_describes_the_notice_the_pass_sends():
    """Tabellen ska säga vilket pass som ger vilken rubrik, och vad raden bär."""
    design = DESIGN.read_text(encoding='utf-8')
    section = design.split('## Passets besked\n')[1].split('\n## ')[0]

    assert 'implementerade' in section
    assert 'Avbrott vid biljett' in section
    assert 'larm' in section and 'vanlig' in section
    assert '**Exitkoderna**: 0 när passet gick bra, 1 när det stannade' in section
    assert 'körningsfilen' in section


def test_the_summary_marker_is_the_same_string_in_the_script_and_the_command():
    """En loop som letar efter något agenten inte ombeds skriva hittar aldrig något."""
    marker = re.search(r'(?m)^SUMMARY_MARKER="([^"]+)"$', ONCE.read_text(encoding='utf-8')).group(1)

    assert marker in TICKET_COMMAND.read_text(encoding='utf-8')


def test_the_turn_limit_is_described_with_the_number_the_script_has():
    seconds = int(re.search(
        r'(?m)^TURN_LIMIT="\$\{RALPH_TURN_LIMIT:-(\d+)\}"$', ONCE.read_text(encoding='utf-8')
    ).group(1))

    assert f'{seconds // 60} minuter' in DESIGN.read_text(encoding='utf-8')


def test_the_ticket_command_asks_for_the_time_the_script_allows():
    """Taket hjälper inte om agenten inte begär tiden, och en timme ryms i varvets tidsgräns."""
    limit = int(re.search(
        r'(?m)^TURN_LIMIT="\$\{RALPH_TURN_LIMIT:-(\d+)\}"$', ONCE.read_text(encoding='utf-8')
    ).group(1))

    assert str(longest_command_ms()) in TICKET_COMMAND.read_text(encoding='utf-8')
    assert longest_command_ms() / 1000 < limit


def test_the_rules_say_that_the_turn_is_the_whole_turn():
    """Ett kommando i bakgrunden dör med turen, och det går inte att se inifrån."""
    prompt = PROMPT.read_text(encoding='utf-8')

    assert 'TaskOutput' in prompt
    assert 'Monitor' in prompt


def test_the_retry_ladder_is_unchanged_in_production():
    """Sviten kortar väntan, och driften får inte ärva det."""
    assert 'delay="${RALPH_RETRY_DELAY:-2}"' in ONCE.read_text(encoding='utf-8')


def test_the_temp_file_has_a_portable_template():
    code = code_of(ONCE)

    assert not re.search(r'mktemp -t [^\s"\']', code)
    assert 'XXXXXX' in code


def ticket_step(name):
    """Raden för ett steg i `/biljett`."""
    found = re.search(rf'(?m)^\d+\. \*\*{name}.*$', TICKET_COMMAND.read_text(encoding='utf-8'))
    assert found, f'/biljett har inget steg {name}'
    return found.group(0)


def ticket_section(heading):
    """Ett avsnitt i `/biljett`, fram till nästa rubrik."""
    command = TICKET_COMMAND.read_text(encoding='utf-8')
    assert f'## {heading}\n' in command, f'/biljett har inget avsnitt {heading}'
    return command.split(f'## {heading}\n')[1].split('\n## ')[0]


def test_the_ticket_command_orders_its_steps_as_the_turn_runs():
    """Granskningen ser bara det som är committat, och slutkörningen ser det som stängs."""
    numbers = [int(ticket_step(name).split('.')[0]) for name in (
        'Notera startpunkten', 'Läs biljetten', 'Implementera', 'Tester under arbetet',
        'Committa', 'Granska', 'Hela sviten', 'Stäng biljetten', 'Pusha',
    )]

    assert numbers == sorted(numbers)
    assert numbers == list(range(1, len(numbers) + 1)), 'inget steg utan namn mellan dem'


def test_the_ticket_command_runs_the_whole_suite_and_the_build_in_one_step():
    """Lagningen av en röd slutkörning går i samma commit, och sviten körs då igen.

    Bygget går efter en grön slutkörning, så att den fristående filen är byggd av
    den kod som stängs, och läggs i samma commit.
    """
    command = TICKET_COMMAND.read_text(encoding='utf-8')
    whole_suite = ticket_step('Hela sviten')

    assert 'npm test' in whole_suite
    assert command.count(str(longest_command_ms())) == 1, 'tiden begärs för slutkörningen'
    assert str(longest_command_ms()) in whole_suite
    assert '--amend' in whole_suite
    assert 'grön' in ticket_step('Stäng biljetten')
    assert command.count('npm run bygg') == 1
    assert whole_suite.index('npm test') < whole_suite.index('grön') < whole_suite.index('npm run bygg')
    assert 'dist/driftplanering.html' in whole_suite


def test_the_ticket_command_does_not_contradict_the_whole_suite_after_the_commit():
    """Regeln om röda tester får inte säga emot att hela sviten går efter committen."""
    limits = ticket_section('Övriga gränser')
    rule = re.search(r'(?m)^- Committa aldrig.*$', limits).group(0)

    assert 'npm test' in rule
    assert 'Hela sviten går efter committen' in rule


def test_the_ticket_command_never_names_photo_managers_suite():
    """Sviten här är `npm test`, och venv:et finns inte i repot."""
    command = TICKET_COMMAND.read_text(encoding='utf-8')

    assert 'venv' not in command
    assert 'pytest' not in command.replace('python3 -m pytest verktyg/test/ralph', '')


def test_the_ticket_command_pushes_the_work_branch_and_never_main():
    push = ticket_step('Pusha')
    command = TICKET_COMMAND.read_text(encoding='utf-8')

    assert '`git push origin HEAD`' in push
    assert not re.search(r'git push\b[^`\n]*\b(main|master)\b', command)
    assert 'gh pr merge' not in command
    assert 'Pusha aldrig till `main`' in ticket_section('Du rör inte main')
    branch = ticket_step('Notera startpunkten')
    assert '`git rev-parse --abbrev-ref HEAD`' in branch and 'pushar på' in branch


def test_the_ticket_command_refers_to_the_ticket_and_never_closes_it_from_the_commit():
    """`Closes #N` hade stängt biljetten vid pushen, innan kommentaren finns."""
    commit = ticket_step('Committa')

    assert 'Refs #$ARGUMENTS' in commit
    assert 'Skriv aldrig `Closes #$ARGUMENTS`' in commit
    assert not re.search(r'(?<!aldrig `)Closes #', TICKET_COMMAND.read_text(encoding='utf-8'))


def test_the_ticket_command_compares_a_failure_with_the_starting_point():
    """Efter committen bär `HEAD` varvets eget arbete, och är inget att jämföra med."""
    assert 'startpunkten från steg 1' in ticket_section('Övriga gränser')


def test_the_ticket_command_reads_the_tickets_text_and_comments():
    """Utan terminal ger `--comments` bara kommentarerna, och inget alls på en biljett utan."""
    read = re.search(r'`(gh issue view [^`]*)`', ticket_step('Läs biljetten')).group(1)

    assert '--comments' not in read
    assert {'title', 'body', 'comments'} <= set(re.search(r'--json (\S+)', read).group(1).split(','))


def test_no_tracked_file_prescribes_reading_a_ticket_with_comments():
    """`--comments` är inte en form någon av repots filer får lära ut.

    Utan terminal skriver den bara ut kommentarerna, inte biljettens text, och
    ingenting alls på en biljett utan kommentarer. Regeln gäller varje fil i repot
    och inte bara agentdokumenten: i photo_manager återkom formen i `/biljett` och i
    `docs/agents/issue-tracker.md`, och nästa gång kan den återkomma var som
    helst — i ett skript, i en docstring, i en README.

    Filerna är de spårade och de ospårade som inte är ignorerade, så att en fil som
    ännu inte är committad prövas också. Den här filen måste stava formerna för att
    kunna pröva dem, och är undantagen. Den som skriver en föreskrift annorstädes
    bär flaggan inne i samma kodcitat som kommandot, och det är den formen regeln
    läser.
    """
    explaining = {'verktyg/test/ralph/test_ralph.py'}
    tracked = subprocess.run(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    ).stdout.split('\0')

    searched = [name for name in tracked if name and name not in explaining]
    assert '.claude/commands/biljett.md' in searched
    assert 'docs/agents/issue-tracker.md' in searched

    prescribing = {}
    for name in searched:
        path = Path(REPO_ROOT) / name
        try:
            lines = path.read_text(encoding='utf-8').splitlines()
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        for number, line in enumerate(lines, 1):
            if re.search(r'`gh issue view\b[^`\n]*--comments', line):
                prescribing[f'{name}:{number}'] = line.strip()

    assert prescribing == {}


def test_the_guard_against_comments_catches_the_forms_it_has_to_catch():
    """Vakten ovan är bara värd något om den fäller på de former som återkommer.

    `$ARGUMENTS` är formen `/biljett` använder; i photo_manager läste vakten först
    bara `<platshållare>` och ett biljettnummer, och hade släppt den igenom. Flaggan i ett eget citat, skilt från kommandot, är däremot hur man
    skriver att den inte duger, och får passera.
    """
    catches = r'`gh issue view\b[^`\n]*--comments'

    for prescription in (
        '`gh issue view <number> --comments`',
        '`gh issue view $ARGUMENTS --comments`',
        '`gh issue view 196 --comments`',
        '`gh issue view --comments <number>`',
        '`gh issue view <number> --comments` is what a skill used to say.',
    ):
        assert re.search(catches, prescription), prescription

    for allowed in (
        '`gh issue view <number> --json title,body,labels,comments`',
        '`gh pr view <number> --comments`',
        'Utan terminal skriver `gh issue view <number> --json …` allt; `--comments` inte.',
    ):
        assert not re.search(catches, allowed), allowed


def test_the_issue_tracker_doc_reads_a_ticket_with_json():
    """Varje läsning i filen ger både biljettens text och dess kommentarer.

    Filen följs i praktiken: `CLAUDE.md` hänvisar dit.
    """
    doc = (Path(REPO_ROOT) / 'docs' / 'agents' / 'issue-tracker.md').read_text(encoding='utf-8')

    reads = [line for line in doc.splitlines() if '`gh issue view <number>' in line]
    assert reads, doc

    for line in reads:
        form = re.search(r'`(gh issue view <number>[^`]*)`', line).group(1)
        fields = set(re.search(r'--json (\S+)', form).group(1).split(','))
        assert {'title', 'body', 'labels', 'comments'} <= fields, line


def test_the_ticket_command_searches_the_open_tickets_before_it_writes_a_new_one():
    """Fyra biljetter gällde samma test, eftersom varje färsk agent skrev en ny."""
    command = TICKET_COMMAND.read_text(encoding='utf-8')

    assert 0 <= command.find('gh issue list --state open') < command.index('gh issue create')
    assert '*Upptäckter utanför biljetten*' in ticket_section('Övriga gränser')


def test_the_ticket_command_does_not_blame_a_red_final_run_on_load():
    """Sviten går efter granskningen, och i photo_manager gav en mening om last sex fällningar ett skäl."""
    command = TICKET_COMMAND.read_text(encoding='utf-8')
    red_run = ticket_section('En röd slutkörning')

    assert 'belastar' not in command
    assert 'granskningens agenter' not in command
    assert re.search(r'[Tt]akfel i slutkörningen är ett fynd', red_run)


def test_a_failure_is_read_and_then_tried_on_the_starting_point():
    """Tillbaka går till arbetsgrenen, eftersom det är där varvet står, och inte till main."""
    red_run = ticket_section('En röd slutkörning')

    read = red_run.index('`FEL`')
    starting_point = red_run.index('startpunkten från steg 1')

    assert read < starting_point
    assert '`git checkout <grenen>`' in red_run[starting_point:]
    assert 'git checkout main' not in TICKET_COMMAND.read_text(encoding='utf-8')


def test_a_preexisting_failure_is_written_up_before_the_suite_runs_again():
    """Ett varv i photo_manager såg felet på startpunkten och startade en ny helsvit utan att skriva något."""
    red_run = ticket_section('En röd slutkörning')

    written_up = red_run.index('*Upptäckter utanför biljetten*')
    searched = red_run.index('öppna biljetterna')
    second_run = red_run.index('andra gången')

    assert searched < second_run
    assert written_up < second_run


def test_the_whole_suite_runs_at_most_twice_and_a_second_red_leaves_the_ticket_open():
    """Utan gräns körde ett varv i photo_manager sviten en fjärde gång när tidsgränsen löste ut."""
    red_run = ticket_section('En röd slutkörning')

    assert 'högst två gånger per varv' in ticket_step('Hela sviten')
    assert 'högst två gånger per varv' in red_run
    assert 'oavsett om felet är ditt eget eller förbefintligt' in red_run
    assert '*Biljetter varvet lämnar öppna*' in red_run
    assert 'fyndets biljett' in red_run
    assert 'ready-for-human' in ticket_section('Biljetter varvet lämnar öppna')


def test_the_design_gives_the_same_ceiling_as_the_ticket_command_and_the_limit_holds_two_runs():
    """Taket är en timme, sviten körs högst två gånger, och båda ryms i tidsgränsen.

    Texterna får inte glida isär: `DESIGN.md` säger det `/biljett` begär.
    """
    design = DESIGN.read_text(encoding='utf-8')
    limit = int(re.search(
        r'(?m)^TURN_LIMIT="\$\{RALPH_TURN_LIMIT:-(\d+)\}"$', ONCE.read_text(encoding='utf-8')
    ).group(1))

    assert longest_command_ms() == 3600000
    ceiling = re.search(r'(?m)^- `BASH_MAX_TIMEOUT_MS`.*$', design).group(0)
    assert 'en timme' in ceiling and '`/biljett` begär den tiden' in ceiling
    assert 'högst två slutkörningar' in design
    assert 'högst två gånger per varv' in ticket_step('Hela sviten')
    assert 2 * longest_command_ms() / 1000 <= limit


@pytest.mark.parametrize('path', [TICKET_COMMAND, DESIGN], ids=lambda path: path.name)
def test_the_texts_give_the_same_length_of_the_suite(path):
    """I photo_manager växte sviten från tjugo minuter till tjugosju medan texterna stod kvar."""
    text = path.read_text(encoding='utf-8')

    assert 'runt en minut' in text
    assert 'tjugo' not in text and 'tjugosju' not in text


def test_the_ticket_command_and_the_rules_keep_out_of_each_others_way():
    """Arbetsordningen bor i `/biljett`, och Leffes deploysteg följde inte med."""
    prompt = PROMPT.read_text(encoding='utf-8')
    command = TICKET_COMMAND.read_text(encoding='utf-8')

    assert 'gh issue close' not in prompt
    assert 'pytest' not in prompt
    assert 'npm test' not in prompt
    assert 'RALPH HALT' not in prompt + command
    assert 'Deploya' not in command


def test_the_rules_say_that_main_is_never_touched():
    """Det som förs in i main går via pull request, och det är Andreas som gör det (beslut 50)."""
    rules = PROMPT.read_text(encoding='utf-8').split('## Du rör inte main\n')[1].split('\n## ')[0]

    assert 'Pusha aldrig till `main`' in rules
    assert 'slå aldrig ihop en pull request' in rules
    assert 'beslut 50' in rules
    assert 'gå inte runt det' in rules, 'spärren på anropet är ett hinder och inget stängsel'


def test_no_text_is_left_from_photo_managers_operations():
    """Pi:n, Stellan och deployen finns inte här, och en regel om dem lär agenten fel sak."""
    for path in (PROMPT, TICKET_COMMAND, ONCE, AFK):
        text = path.read_text(encoding='utf-8')
        for word in ('Pi:n', 'Stellan', 'deploy', 'ADR-0036', 'fotografen', 'venv'):
            assert word not in text, f'{path.name} nämner {word}'


# ============================================================
# Beskedet som går ut
# ============================================================

@pytest.fixture
def phone():
    server = Ntfy()
    yield server
    server.close()


#: En adress där ingen svarar, så att ett test som glömmer sin egen inte når ntfy.sh.
NOWHERE = 'http://127.0.0.1:9'


def run_notify(env, *arguments):
    inherited = {name: value for name, value in os.environ.items() if not name.startswith('RALPH_')}
    return subprocess.run(
        [str(NOTIFY), *arguments],
        capture_output=True, text=True,
        env={**inherited, 'RALPH_NTFY_URL': NOWHERE, **env},
    )


def test_the_alarm_reaches_the_topic_in_the_file_with_a_heard_priority(phone, tmp_path):
    topic = tmp_path / 'topic'
    topic.write_text('ett-eget-topic\n', encoding='utf-8')

    result = run_notify(
        {'RALPH_NTFY_TOPIC_FILE': str(topic), 'RALPH_NTFY_URL': phone.url},
        '--alarm', 'Ralph avbruten', '2 biljetter implementerade. Avbrott vid biljett 3 av 5.',
    )

    assert result.returncode == 0, result.stderr
    sent = phone.notifications()[0]
    assert sent['topic'] == 'ett-eget-topic'
    assert sent['title'] == 'Ralph avbruten (Driftplanering)', 'telefonen tar emot notiser från flera håll'
    assert sent['message'] == '2 biljetter implementerade. Avbrott vid biljett 3 av 5.'
    assert sent['priority'] == 4
    assert sent['tags'] == ['warning']


def test_a_pass_that_went_well_is_an_ordinary_notice(phone, tmp_path):
    """`Rent stall` ska inte höras som ett larm: inget hände som kräver något."""
    topic = tmp_path / 'topic'
    topic.write_text('ett-eget-topic\n', encoding='utf-8')

    result = run_notify(
        {'RALPH_NTFY_TOPIC_FILE': str(topic), 'RALPH_NTFY_URL': phone.url},
        'Rent stall', '3 biljetter implementerade på 4h 35m.',
    )

    assert result.returncode == 0, result.stderr
    sent = phone.notifications()[0]
    assert sent['title'] == 'Rent stall (Driftplanering)'
    assert sent['message'] == '3 biljetter implementerade på 4h 35m.', 'svenska tecken går fram'
    assert sent['priority'] == 3
    assert sent['tags'] == ['white_check_mark']


def test_the_topic_beside_the_script_is_used_when_nothing_else_is_said(phone, tmp_path):
    """Utan `RALPH_NTFY_TOPIC_FILE` läses `ntfy_topic` i skriptets egen katalog."""
    copy = tmp_path / 'ralph'
    copy.mkdir()
    shutil.copy2(NOTIFY, copy / 'notify.py')
    (copy / 'ntfy_topic').write_text('topicet-bredvid\n', encoding='utf-8')
    inherited = {name: value for name, value in os.environ.items() if not name.startswith('RALPH_')}

    result = subprocess.run(
        [str(copy / 'notify.py'), 'Rent stall', 'något'],
        capture_output=True, text=True, env={**inherited, 'RALPH_NTFY_URL': phone.url},
    )

    assert result.returncode == 0, result.stderr
    assert phone.notifications()[0]['topic'] == 'topicet-bredvid'


def test_a_notice_ntfy_refuses_did_not_get_through(phone, tmp_path):
    topic = tmp_path / 'topic'
    topic.write_text('ett-eget-topic', encoding='utf-8')
    phone.answer = 500

    result = run_notify(
        {'RALPH_NTFY_TOPIC_FILE': str(topic), 'RALPH_NTFY_URL': phone.url},
        'Rent stall', 'något',
    )

    assert result.returncode == 1
    assert 'gick inte fram' in result.stderr and '500' in result.stderr
    assert 'Traceback' not in result.stderr


def test_a_notice_without_its_two_parts_is_a_usage_error(tmp_path):
    """Rubriken och raden hör ihop, och ett besked utan båda är inget besked."""
    topic = tmp_path / 'topic'
    topic.write_text('ett-eget-topic\n', encoding='utf-8')

    for arguments in (('bara en rad',), ('Rent stall', 'raden', 'en tredje')):
        result = run_notify({'RALPH_NTFY_TOPIC_FILE': str(topic)}, *arguments)
        assert result.returncode == 2, arguments
        assert 'Användning' in result.stderr


@pytest.mark.parametrize('content', [None, '  \n'], ids=['saknas', 'tom'])
def test_an_alarm_without_a_topic_says_it_did_not_get_through(phone, tmp_path, content):
    """En instans utan topic tiger med flit, men här är tystnaden skälet till beskedet."""
    topic = tmp_path / 'topic'
    if content is not None:
        topic.write_text(content, encoding='utf-8')

    result = run_notify(
        {'RALPH_NTFY_TOPIC_FILE': str(topic), 'RALPH_NTFY_URL': phone.url},
        'Rent stall', 'något',
    )

    assert result.returncode == 1
    assert 'Ingen notis' in result.stderr
    assert phone.notifications() == []


def test_an_alarm_that_cannot_reach_ntfy_says_why_without_a_traceback(phone, tmp_path):
    topic = tmp_path / 'topic'
    topic.write_text('ett-eget-topic', encoding='utf-8')
    phone.close()

    result = run_notify(
        {'RALPH_NTFY_TOPIC_FILE': str(topic), 'RALPH_NTFY_URL': phone.url},
        'Rent stall', 'något',
    )

    assert result.returncode == 1
    assert 'gick inte fram' in result.stderr
    assert 'Traceback' not in result.stderr


#: Körs i systemets `python3 -I`: varje modul notisskriptet importerar ska vara
#: inbyggd eller ligga i standardbiblioteket, och inte i site-packages.
#: `sys.stdlib_module_names` finns först i 3.10, och Macens python3 är 3.9.
STDLIB_ONLY = """
import ast, importlib.util, os, sys, sysconfig
tree = ast.parse(open(sys.argv[1], encoding='utf-8').read())
names = set()
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        names.update(alias.name.split('.')[0] for alias in node.names)
    elif isinstance(node, ast.ImportFrom) and node.level == 0:
        names.add(node.module.split('.')[0])
stdlib = os.path.realpath(sysconfig.get_paths()['stdlib'])
outside = []
for name in sorted(names):
    spec = importlib.util.find_spec(name)
    origin = spec.origin if spec else None
    if origin in ('built-in', 'frozen'):
        continue
    real = os.path.realpath(origin or '')
    if not real.startswith(stdlib + os.sep) or 'site-packages' in real:
        outside.append(f'{name}: {origin}')
print(' '.join(sorted(names)))
sys.exit('utanför standardbiblioteket: ' + ', '.join(outside) if outside else 0)
"""


def system_python():
    """Den `python3` skriptets `#!/usr/bin/env python3` hittar."""
    found = shutil.which('python3')
    assert found, 'python3 saknas på PATH'
    return found


def test_the_alarm_imports_nothing_but_the_standard_library():
    """Skriptet går på systemets `python3`, och där finns inga paket installerade för repot."""
    environment = {
        key: value for key, value in os.environ.items()
        if key not in ('VIRTUAL_ENV', 'PYTHONPATH', 'PYTHONHOME')
    }

    result = subprocess.run(
        [system_python(), '-I', '-c', STDLIB_ONLY, str(NOTIFY)],
        capture_output=True, text=True, env=environment,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert 'urllib' in result.stdout.split(), 'kontrollen läste inga importer'


def test_the_alarm_runs_isolated_on_the_systems_python(phone, tmp_path):
    """`-I` stänger ute miljön, användarens site-packages och skriptets katalog på sys.path."""
    assert NOTIFY.read_text(encoding='utf-8').startswith('#!/usr/bin/env python3\n')
    topic = tmp_path / 'topic'
    topic.write_text('ett-eget-topic\n', encoding='utf-8')
    environment = {
        key: value for key, value in os.environ.items()
        if key not in ('VIRTUAL_ENV', 'PYTHONPATH', 'PYTHONHOME') and not key.startswith('RALPH_')
    }

    result = subprocess.run(
        [system_python(), '-I', str(NOTIFY), '--alarm', 'Ralph avbruten', 'något'],
        capture_output=True, text=True, cwd=tmp_path,
        env={**environment, 'RALPH_NTFY_TOPIC_FILE': str(topic), 'RALPH_NTFY_URL': phone.url},
    )

    assert result.returncode == 0, result.stderr
    assert phone.notifications()[0]['title'] == 'Ralph avbruten (Driftplanering)'


def test_the_topic_and_the_run_files_stay_out_of_git():
    """Topicet är larmets adress, och körningsfilerna hade spärrat nästa varv."""
    for path in ('ralph/ntfy_topic', 'ralph/runs/pass.md'):
        result = subprocess.run(
            ['git', 'check-ignore', '-q', path], cwd=REPO_ROOT, capture_output=True
        )
        assert result.returncode == 0, f'{path} är inte ignorerad'
