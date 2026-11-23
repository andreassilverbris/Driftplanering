# Loopens egna regler

Det här är vad som gäller när **ingen tittar**. Arbetsordningen för varvet står i `/biljett` och upprepas inte här. Den ska vara densamma vare sig en människa kör den i terminalen eller loopen kör den genom `claude --print`.

## Biljetten är utvald åt dig

`once.sh` har redan hämtat frontiern och plockat den lägsta biljetten utan öppna blockerare. Numret står i kommandot du fick. Välj inte en annan, och bredda inte varvet till en angränsande biljett som råkar se lätt ut.

## Ingen svarar på en fråga

Det finns ingen människa i loopen. Det betyder inte att du ska gissa. Det betyder att osäkerhet tar vägen ut genom det som finns kvar efteråt: en kommentar, en relabel eller en egen biljett. Vilken väg som gäller när står i `/biljett`.

Ingen läser din fråga, och ett antagande du bygger vidare på upptäcks först när Andreas tittar på arbetsgrenen. Där kostar det mycket mer att hitta.

## Du rör inte main

Varvet arbetar på arbetsgrenen det startade på och pushar bara dit (beslut 50 i `docs/koncept-och-beslut.md`). Pusha aldrig till `main`, slå aldrig ihop en pull request, och skapa inga grenar. Det är Andreas som för in arbetsgrenen i `main`, efter att ha tittat på den.

Kommandona är dessutom spärrade på anropet. Får du ett nej, gå inte runt det.

## Stanna hellre än att rulla vidare

Ett varv som lämnar biljetten öppen stannar passet, oavsett hur många varv som gått bra före. Det är avsiktligt, och bättre än att kön rullar vidare på ett antagande.

Varvet har också en tidsgräns. Löser den ut avbryts du mitt i, ditt arbete sparas i en stash och passet stannar. Det är ingen kostnad att arbeta noggrant, men en kostnad att fastna.

## Turen är varvet

Slutar du svara är varvet över. `claude --print` väntar inte på kommandon i bakgrunden: de dödas några sekunder efter att din tur tagit slut, `Monitor` med dem, och ingenting väcker dig. Varvet står då utan commit och biljetten öppen.

Bara bakgrundsagenter, som granskarna, väcker dig med en ny tur. Kör långa kommandon i förgrunden, som `/biljett` säger. Hamnar ett kommando ändå i bakgrunden, vänta på det med `TaskOutput` i samma tur tills det är klart.

## Din sammanfattning är det enda loopen ser

Skriv den som ett besked till någon som läser den i morgon utan att ha sett körningen: vilken biljett, vad som byggdes, vad testerna visade, vad du var osäker på, och vilka biljetter du skapade och varför.

Den hamnar i passets körningsfil, ett block per varv, och är det enda som finns kvar av varvet när fönstret stängts. Markören som avgränsar den står i `/biljett`.
