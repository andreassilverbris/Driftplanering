#!/usr/bin/env python3
"""Loopens besked, från Macen till Andreas telefon.

Passet slutar obevakat, och då behöver någon veta att det är över och hur mycket
det hann med. Beskedet är en rubrik och en rad, och inget mer: hur det gick frågar
Andreas Claude om, och Claude läser körningsfilen.

Ett pass som gick bra säger `Rent stall` som en vanlig notis. Ett pass som stannade
säger `Ralph avbruten` som ett larm, och skälet står inte här utan i körningsfilen.
Rubrikerna skrivs av afk.sh, som är den som räknar.

Notisen går till ntfy som JSON, så att rubriken kan bära svenska tecken, vilket ett
HTTP-huvud inte kan. Skriptet kräver bara standardbiblioteket och går på systemets
`python3`. Det är portat från photo_manager, där samma sak görs av appens egen
notismodul.

Topicet ligger i `ntfy_topic` bredvid skriptet, utanför git. Saknas filen räknas det
som att notisen inte gick fram, så att afk.sh kan säga att beskedet bara står i
terminalen.

Användning: ralph/notify.py [--alarm] "Rubrik" "Raden under den."
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

RALPH_DIR = Path(__file__).resolve().parent

DEFAULT_URL = 'https://ntfy.sh'

#: Rubriken bär projektet, eftersom telefonen tar emot notiser från flera håll.
PROJECT = 'Driftplanering'

#: Så länge ntfy får på sig innan notisen räknas som att den inte gick fram.
TIMEOUT_SECONDS = 10

#: Prioriteterna ntfy känner: ett pass som gick bra har förvalet, ett larm hörs.
DEFAULT_PRIORITY = 3
HIGH_PRIORITY = 4


def notification(title, line, alarm):
    """Notisen som JSON-fält, utan topic."""
    return {
        'title': title,
        'message': line,
        'priority': HIGH_PRIORITY if alarm else DEFAULT_PRIORITY,
        'tags': ['warning'] if alarm else ['white_check_mark'],
    }


def send(base_url, topic, fields):
    """Skicka notisen. Svarar None när den gick fram, annars varför inte."""
    request = urllib.request.Request(
        base_url.rstrip('/') + '/',
        data=json.dumps({'topic': topic, **fields}, ensure_ascii=False).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS):
            return None
    except urllib.error.HTTPError as e:
        return f'ntfy svarade {e.code}'
    except (urllib.error.URLError, OSError) as e:
        return f'ntfy gick inte att nå ({e})'


def main(argv):
    arguments = argv[1:]
    alarm = False
    if arguments and arguments[0] == '--alarm':
        alarm = True
        arguments = arguments[1:]
    if len(arguments) != 2:
        print(f'Användning: {argv[0]} [--alarm] "Rubrik" "Raden under den."', file=sys.stderr)
        return 2
    heading, line = arguments

    topic_file = Path(os.environ.get('RALPH_NTFY_TOPIC_FILE') or RALPH_DIR / 'ntfy_topic')
    try:
        topic = topic_file.read_text(encoding='utf-8').strip()
    except OSError as e:
        print(f'Ingen notis: {topic_file} gick inte att läsa ({e})', file=sys.stderr)
        return 1
    if not topic:
        print(f'Ingen notis: {topic_file} är tom', file=sys.stderr)
        return 1

    reason = send(
        os.environ.get('RALPH_NTFY_URL') or DEFAULT_URL,
        topic,
        notification(f'{heading} ({PROJECT})', line, alarm),
    )
    if reason:
        print(f'Notisen gick inte fram: {reason}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
