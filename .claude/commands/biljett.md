---
description: Ta biljett <nr> hela vägen — implementera, committa, granska, kör hela sviten, bygg, stäng, pusha
---

# /biljett $ARGUMENTS

Ta biljett **#$ARGUMENTS** hela vägen i ett varv. Den här filen är arbetsordningen, och den är densamma vare sig en människa kör den i terminalen eller loopen kör den genom `claude --print`.

Läs `CLAUDE.md`, `GLOSSARY.md`, `docs/koncept-och-beslut.md` och de idéer i `docs/ideer-och-resonemang.md` som biljetten vilar på innan du börjar koda. De numrerade besluten gäller som ADR:er: motsäger din implementation ett beslut är det beslutet som gäller.

## Varvets ordning

Följden är fastlagd. Hoppa inte över ett steg, och byt inte plats på två.

1. **Notera startpunkten och grenen.** `git rev-parse HEAD` och `git rev-parse --abbrev-ref HEAD`. Granskningen mäter mot startpunkten, och grenen är den du arbetar och pushar på.
2. **Läs biljetten.** `gh issue view $ARGUMENTS --json title,body,labels,comments`. Arbeta bara med den. Pekar den på en spec, läs specen på samma sätt.
3. **Implementera**, med TDD där det finns en söm. Testerna är webbläsartester i `verktyg/test/kor-tester.js`: de klickar sig igenom sidan som en användare och läser planeringen via `DP.Plan` (och balanseringens uträkning via `DP.Balansering`) med `page.evaluate`. Utöka dem för det biljetten bygger. Ta skärmdumpar och titta på dem när biljetten rör utseendet: huvudvyn ska rymmas på 1920×1200 utan att sidan scrollar.
4. **Tester under arbetet.** Kör `npm test` så ofta du behöver; sviten tar runt en minut. Rör biljetten `ralph/`, kör också `python3 -m pytest verktyg/test/ralph`.
5. **Committa.** En commit med rubriken i imperativ, som `git log` visar, och `Refs #$ARGUMENTS` i brödtexten. Stagea bara egna filer, vid namn. Skriv aldrig `Closes #$ARGUMENTS`: pushen hade stängt biljetten innan kommentaren finns. Ändrar biljetten något som `CLAUDE.md` eller `docs/` beskriver, uppdatera dem i samma commit.
6. **Granska.** Kör `/code-review` med startpunkten från steg 1 som fast punkt. Åtgärda det som är biljettens, lägg lagningen i samma commit med `git commit --amend`, och kör `npm test` för lagningen.
7. **Hela sviten och bygget.** När granskarna är klara: `npm test`, i förgrunden och med Bash-verktygets `timeout` satt till 3600000. Den körs högst två gånger per varv. Blir den röd: gör som *En röd slutkörning* säger, och lägg en lagning i samma commit med `git commit --amend`. När den är grön: `npm run bygg`, som bygger om `dist/driftplanering.html`. Ändrades filen, lägg den i samma commit med `git commit --amend`.
8. **Stäng biljetten.** Bara efter en grön helsvit på den kod som stängs. `gh issue close $ARGUMENTS --comment "<dokumentationen>"`. Kommentaren är där arbetet hittas igen: vad som byggdes, vad som var lastbärande, vad testerna visade, och vad du valde som kunde ha valts annorlunda.
9. **Pusha.** `git push origin HEAD`, alltså till arbetsgrenen från steg 1. `ralph/once.sh` kontrollerar själv att committen nådde GitHub.

## Du rör inte main

Varvet arbetar på arbetsgrenen och pushar bara dit (beslut 50). Pusha aldrig till `main`, slå aldrig ihop en pull request, skapa inga grenar och inga worktrees. Andreas tittar på arbetsgrenen via `https://raw.githack.com/andreassilverbris/Driftplanering/<grenen>/index.html` och för in den i `main` när han ber om det.

Beroenden får du installera med `npm install` när biljetten kräver det, men tänk på att sidan ska fungera direkt från disk utan byggsteg och utan nätverk: nya bibliotek hör hemma i `vendor/` som klassiska skript.

## Biljetter varvet lämnar öppna

En biljett du **inte** stänger byter etikett till `ready-for-human`, oavsett skäl:

```
gh issue edit $ARGUMENTS --add-label ready-for-human --remove-label ready-for-agent
```

Utan bytet plockar nästa pass samma biljett och gör om samma arbete. Kommentera samtidigt vad som återstår och exakt vad som krävs för att verifiera det. Bocka aldrig av ett kriterium du mockat dig förbi: ett mockat resultat som "fungerar" döljer glappet tills någon kör på riktigt.

Är biljetten otydlig på en punkt som ändrar vad som byggs: bygg inte på ett antagande. Lämna den på samma sätt och skriv frågan i kommentaren. Pedagogiken är det viktigaste i det här projektet, och en fråga om hur något ska förklaras för driftplaneraren är en sådan punkt.

## Upptäckter utanför biljetten

Ser du ett problem i angränsande kod: laga det inte, och tig inte ihjäl det. Sök först bland de öppna biljetterna, på testets namn eller på orden i felet:

```
gh issue list --state open --search "..." --json number,title
```

Rör fyndet en biljett som redan finns, kommentera där. Annars skriver du en egen biljett med **`needs-triage`**, på svenska:

```
gh issue create --label needs-triage --title "..." --body "..."
```

Aldrig `ready-for-agent`. En loop som fyller sin egen kö arbetar på uppdrag ingen gett den.

## En röd slutkörning

Hela sviten körs högst två gånger per varv efter granskningen, oavsett om felet är ditt eget eller förbefintligt. En tredje körning ger inget svar den andra inte gav.

Ett takfel i slutkörningen är ett fynd och inte last. Sviten går efter granskningen, och då kör ingenting annat på Macen. Kör inte om hela sviten för att se om felet går över.

Pröva felen som fällde, innan hela sviten körs igen:

1. Läs vilka kontroller som fick `FEL` i utdatan.
2. Kör sviten på startpunkten från steg 1, med `git checkout <startpunkten>` och direkt tillbaka med `git checkout <grenen>`. Efter committen bär `HEAD` ditt eget arbete, och är inget att jämföra med.
3. Fäller kontrollen med ditt arbete men inte på startpunkten är felet ditt. Laga det, lägg lagningen i samma commit med `git commit --amend`.
4. Annars är felet inte ditt att laga i det här varvet. Skriv upp det enligt *Upptäckter utanför biljetten*, och sök alltså först bland de öppna biljetterna. Notera fyndets biljett.

Kör sedan hela sviten den andra gången, oavsett vad lagningen rörde.

Blir den andra körningen röd finns ingen grön helsvit att stänga på, och sviten körs inte en tredje gång. Pröva de fel som fällde nu på samma sätt, så att varje fel som inte är ditt har en biljett. Lämna sedan biljetten öppen enligt *Biljetter varvet lämnar öppna*. Kommentaren nämner fyndets biljett när ett fel inte är ditt, och säger vad som återstår av ditt eget.

## Övriga gränser

- Committa aldrig halvfärdig kod. Är `npm test` röd, committa inte. Hela sviten går efter committen, och ingenting pushas förrän den är grön.
- Innan du skyller ett testfel på ditt eget arbete: pröva det på startpunkten från steg 1, som *En röd slutkörning* beskriver. Ett förbefintligt fel är inte ditt att laga i det här varvet. Skriv upp det enligt *Upptäckter utanför biljetten* och säg det i sammanfattningen.
- Följ kodstilen i `CLAUDE.md`: ES5, svenska namn, ett IIFE per fil under `window.DP`, klassiska skripttaggar och ingen `fetch` av lokala filer.

## Sammanfattningen

Avsluta med en kort sammanfattning på svenska: vad som byggdes, vad testerna visade, vad du var osäker på, och vilka nya biljetter du skrev och varför.

Inled den med den här strängen på egen rad:

```
RALPH SAMMANFATTNING
```

Allt du skriver **efter** den raden går in i passets körningsfil, ett block per varv, och är det enda som finns kvar av varvet när fönstret stängts. Strängen definieras här och letas efter av `ralph/once.sh`, och ett test håller ihop de två. Glömmer du den bär blocket utdatans sista rader, med en not om att markören saknades.
