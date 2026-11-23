# Ralph-loopen i Driftplanering

Loopen tar `ready-for-agent`-biljetter inom ett spår, en i taget, med en färsk agent per varv. Beslutet står som beslut 50 i [koncept-och-beslut.md](../docs/koncept-och-beslut.md). Den är portad från photo_manager (`~/photo_manager/ralph/`), som i sin tur portade den från Leffe (`~/pajprojekt/ralph/`), där den är provkörd. Deras `DESIGN.md` bär historiken och de mätningar som ligger bakom skriptens form. `#N` i de filerna avser deras biljetter.

## Kör så här

Starta passet i en egen terminal och inte inifrån en annan Claude-session. Stå på en arbetsgren, aldrig på `main`.

```bash
git switch -c claude/etapp-5                 # en gång, eller git switch claude/etapp-5
caffeinate -is ./ralph/afk.sh 1 etapp-5      # ett varv — börja alltid så
caffeinate -is ./ralph/afk.sh 7 etapp-5      # sju varv
```

Andra argumentet är **spåret**, en etikett som AND:as med `ready-for-agent`. Frontiern är de öppna biljetter som bär båda och inte har någon öppen blockerare, och lägst nummer vinner. Inom ett spår är det alltså GitHubs beroenden som bestämmer ordningen, och en biljett som ska vänta behöver en blockerare. `to-tickets` sätter blockerarna men inte spåret, så spåret läggs på när biljetterna skapas.

`caffeinate` håller Macen vaken, eftersom ett pass kan ta timmar. Arbetskopian måste vara ren, annars vägrar varvet starta, och ingen annan session får arbeta i arbetsträdet under passet.

Efter passet tittar Andreas på arbetsgrenen via `https://raw.githack.com/andreassilverbris/Driftplanering/<grenen>/index.html`, eller i den fristående filen `dist/driftplanering.html`, och ber om en pull request till `main` när det ser bra ut.

## Filerna

| Fil | Vad den gör |
|---|---|
| `afk.sh` | Passet: flera varv, och vad varje utfall betyder |
| `once.sh` | Varvet: väljer biljetten, kör agenten, avgör utfallet och skriver blocket |
| `prompt.md` | Det som gäller när ingen tittar. Går som systemprompt-tillägg |
| `notify.py` | Passets besked till telefonen, en rubrik och en rad |
| `.claude/commands/biljett.md` | Arbetsordningen. Går som `/biljett <nr>` |
| `ntfy_topic` | Beskedets topic, en rad. Utanför git |
| `runs/` | Passens körningsfiler. Utanför git |

Testerna står i `verktyg/test/ralph/`, och körs med `npm run test:ralph` (`python3 -m pytest verktyg/test/ralph`). Skripten körs oförändrade i ett temporärt git-repo, med stubbar för `claude` och `gh`. De är inte en del av `npm test`, eftersom de kräver pytest och bara rör loopen.

## Beskedets topic

Notisen går till ntfy. Skapa ett eget topic i ntfy-appen på telefonen (ett långt, svårgissat namn, eftersom alla som känner namnet kan läsa det) och skriv namnet på en rad i `ralph/ntfy_topic`:

```bash
echo "ett-langt-hemligt-namn" > ralph/ntfy_topic
```

Saknas filen går passet ändå, och terminalen säger att notisen inte gick fram.

## Utfallen

Kanalen mellan skripten är `once.sh`:s exitkod (`OUTCOME_*`), inte en utskriven markör. `afk.sh` läser koderna ur `once.sh`.

| Utfall | Vad passet gör | Biljetten |
|---|---|---|
| `KLART` | går vidare, och räknar biljetten som implementerad | stängd |
| `TOM KÖ` | slutar med `Rent stall` | – |
| `STALL` | stannar med `Ralph avbruten` | öppen. Agenten har relabelat den, eller slutat mitt i efter en commit |
| `AGENTFEL` | ett omförsök, sedan `Ralph avbruten` | orörd tills omförsöket. Agenten avbröts, eller slutade mitt i utan commit |
| `MILJÖFEL` | stannar med `Ralph avbruten` | orörd, felet är inte dess. Hit hör ett varv som står på `main` |

Ett varv som når tidsgränsen (`RALPH_TURN_LIMIT`, 120 minuter) blir ett `STALL`, och det som hann skrivas sparas i en stash. Se `git stash list`.

## Passets besked

När passet slutar får Andreas en notis med en rubrik och en rad. Samma två rader är passets sista i terminalen, och inget mer — utom raden om att notisen inte gick fram. Hur det gick frågar han Claude om, och Claude läser körningsfilen i `ralph/runs/`.

| Passet | Rubrik | Raden | Notisen |
|---|---|---|---|
| gick bra: tom kö, eller alla iterationer | `Rent stall` | `3 biljetter implementerade på 4h 35m. 1 biljett skapades.` | vanlig |
| stannade: stall, upprepat agentfel, miljöfel eller okänt utfall | `Ralph avbruten` | `2 biljetter implementerade. Avbrott vid biljett 3 av 5 i loopen.` | larm |

- **Implementerade** är de varv som fick `KLART`.
- **Skapades** är skillnaden mellan det högsta biljettnumret i repot vid passets start och vid dess slut. Skapades ingen utelämnas meningen.
- **Tiden** är passets väggtid, skriven `4h 35m`, och under en timme bara som minuter: `42m`.
- **"Av N"** är antalet `ready-for-agent`-biljetter i spåret utan öppna blockerare när passet startade, men aldrig fler än iterationerna. Gick talet inte att läsa står det som `?`.
- **Skälet till ett avbrott står inte i beskedet**, utan i terminalen och i körningsfilen.
- **Exitkoderna**: 0 när passet gick bra, 1 när det stannade. Kedjan `./ralph/afk.sh 3 etapp-5 && ./ralph/afk.sh 4 städning` fungerar därför, och varje pass i kedjan ger sitt eget besked.
- Ett pass som **dödas** ger inget besked, och inte heller ett som **vägrar starta**, till exempel utan spår. En notis som inte går fram fäller aldrig passet.

Att agenten *slutade mitt i* läses på biljetten: den är öppen och bär kvar `ready-for-agent`. `/biljett` säger att en biljett varvet lämnar öppen byter etikett, så agenten har varken stängt eller lämnat den. Resterna sparas i en stash. Utan commit får varvet ett omförsök från samma punkt. Med en commit stannar passet, eftersom ingen vet hur långt committen kom.

## Turen är varvet

`claude --print` väntar på bakgrundsagenter men inte på kommandon i bakgrunden. När agentens tur tar slut dödas kommandon och `Monitor` efter några sekunder. Bara agenter väcker agenten med en ny tur. I photo_manager kostade det ett helt varv när sviten flyttades till bakgrunden.

Tre saker möter det:

- `BASH_MAX_TIMEOUT_MS` på `claude`-anropet höjer Bash-verktygets tak till en timme, och `/biljett` begär den tiden för sviten. Sviten tar här runt en minut, så taket är en marginal och inget krav.
- `prompt.md` säger att turen är varvet, och att ett kommando i bakgrunden väntas ut med `TaskOutput`.
- `once.sh` känner igen en agent som slutat mitt i, enligt *Utfallen*.

## Skillnaderna mot photo_manager

- **Varvet arbetar på en arbetsgren och vägrar starta på `main`** (eller `master`, eller en lös `HEAD`). `CLAUDE.md` säger att inget pushas direkt till `main`. Agenten pushar med `git push origin HEAD`, och `--disallowedTools` nekar `git push` mot `main` och `gh pr merge`.
- **Sviten är `npm test`**, webbläsartester i Playwright som tar runt en minut. Förkontrollen frågar efter `node` och `node_modules/playwright` i stället för venv:et. Under arbetet får agenten köra hela sviten fritt, eftersom det inte finns några riktade testfiler att välja; regeln om högst två slutkörningar efter granskningen står kvar.
- **Varvet bygger den fristående filen** med `npm run bygg` efter en grön slutkörning, och lägger `dist/driftplanering.html` i samma commit.
- **Varvet uppdaterar `docs/` och `CLAUDE.md`** i samma commit när biljetten ändrar något de beskriver, som `CLAUDE.md` kräver.
- **Inget om driften:** inga spärrar för `ssh` eller driftskript, eftersom det inte finns någon server.
- **Besluten är numrerade i `docs/koncept-och-beslut.md`** i stället för ADR:er. `/biljett` läser dem och `GLOSSARY.md`.
- **Notisen är fristående** och kräver bara Pythons standardbibliotek. I photo_manager går den genom appens egen notismodul.
- **Testerna ligger utanför `npm test`**, i `verktyg/test/ralph/`, och körs med pytest på systemets `python3`.
- **Identifierarna i skripten är på engelska**, som i photo_manager, så att de två kopiorna går att jämföra rad för rad. Kommentarerna och utskrifterna är på svenska.
