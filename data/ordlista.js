/*
 * Ordlistan: begreppen som driftplaneraren möter i verktyget.
 *
 * Formuleringarna följer `GLOSSARY.md`, men är skrivna för den som står mitt i arbetet:
 * kort förklaring först, och exempel ur de fyra byggnaderna där det gör begreppet konkret.
 * Ordlistan är data och inte markup, så att den kan öppnas från alla huvudsteg utan att
 * något steg behöver äga texten.
 */
(function () {
  'use strict';

  var DP = window.DP;

  DP.ordlista = [
    {
      grupp: 'Byggnaden',
      poster: [
        { ord: 'Byggnad → Plan → Rum',
          text: 'Den fysiska strukturen. Plan och rum har var sitt id och en benämning, t.ex. plan <b>02 – Kontorsplan</b> och rum <b>2010 – Konferensrum</b>.' },
        { ord: 'Byggnadstyp',
          text: 'Den sortens byggnad det är (Garage, Kasern, Hangar …). Byggnadstypen ger standardplaneringen och avgör vilka byggnader planeringen kan kopieras mellan.' },
        { ord: 'Område',
          text: 'En grupp byggnader som ligger så nära varandra att avståndet inte spelar någon roll för veckoplaneringen. Garaget och de två kasernerna ligger på <b>Kasernområdet</b>, hangaren på <b>Flygfältet</b>.' },
        { ord: 'Område man åker till',
          text: 'Ett område som ligger så långt bort att man vill samla besöken där till samma vecka i stället för att åka dit flera gånger.' }
      ]
    },
    {
      grupp: 'Installationer och åtgärder',
      poster: [
        { ord: 'Signifikant installation',
          text: 'Registreras som individ med ett id på 8 siffror, t.ex. <b>00000089</b>. Ska alltid ha minst en kopplad åtgärd. Klickbar i modellen.' },
        { ord: 'Övrig installation',
          text: 'Registreras inte som individ, t.ex. lysrörsarmaturer, väggbrytare och toalettstolar. Kontrolleras översiktligt i <i>Kontroll byggnad invändigt</i>. Syns i modellen men går inte att klicka på.' },
        { ord: 'Åtgärd',
          text: 'Något som ska göras, t.ex. <i>Kontroll handbrandsläckare</i>. Alla åtgärder finns i en bruttolista.' },
        { ord: 'Generell åtgärd',
          text: 'En åtgärd som gäller byggnaden som helhet i stället för en installation: <i>Kontroll byggnad invändigt</i> och <i>Kontroll byggnad utvändigt</i>.' },
        { ord: 'Åtgärdstext och kontrollpunkter',
          text: 'Åtgärdstexten beskriver vad som ska göras som en lista med kontrollpunkter. Den finns i tre nivåer: standard, avvikande för en installation och avvikande i ett enskilt rutintillfälle.' },
        { ord: 'Tyngd',
          text: 'En grov bedömning av hur mycket arbete en åtgärd är per installation: lätt, normal eller tung. Används bara för att föreslå planerad tid.' }
      ]
    },
    {
      grupp: 'Planering',
      poster: [
        { ord: 'Planering',
          text: 'Det man bestämmer för en byggnad i taget: besöksfrekvens, ronder, frekvens per rond, utförare, kopplade åtgärder och planerad tid.' },
        { ord: 'Besöksfrekvens',
          text: 'Hur ofta någon behöver vara i byggnaden.' },
        { ord: 'Rond',
          text: 'Det man planerar mot: en grupp åtgärder som görs vid samma tillfälle och har samma frekvens och utförare, t.ex. <i>Brandskydd</i> eller <i>Byggnad invändigt</i>.' },
        { ord: 'Frekvens',
          text: 'Planeras alltid i veckor: ett rullande intervall och en startvecka. "Varje månad" betyder var 4:e vecka (13 gånger per år).' },
        { ord: 'Utförare',
          text: 'Den person som går en rond. Sätts på ronden och ärvs av alla dess åtgärder.' },
        { ord: 'Rutintillfälle',
          text: 'Ett konkret tillfälle då en rond ska utföras: en byggnad × en rond × en utförare × en vecka, t.ex. <b>Hangar-Brandskydd-2027v05</b>. Det är det som drifteknikern ser i telefonen.' },
        { ord: 'Planerad tid',
          text: 'Hur lång tid ett rutintillfälle förväntas ta, angivet i dagsdelar. Sätts per rond och byggnad, inte per åtgärd. Verktyget föreslår en tid ur antalet kopplade installationer och åtgärdernas tyngd, och visar uträkningen.' },
        { ord: 'Dagsdel',
          text: 'Den grova skalan för planerad tid: <b>kort</b> (≈ 1 h), <b>kvartsdag</b> (2 h), <b>halvdag</b> (4 h) och <b>heldag</b> (8 h). Ett rutintillfälle ska rymmas på en dag.' },
        { ord: 'Ändrad förutsättning',
          text: 'Att en rond tar en annan tid än när dess planerade tid godkändes, för att åtgärderna i ronden ändrats eller för att tiden är kopierad från en annan byggnad. Ronden markeras med det nya förslaget, men den godkända tiden ändras aldrig av sig själv: den gäller tills du använder förslaget eller behåller din tid.' },
        { ord: 'Standardplanering',
          text: 'En färdig planering per byggnadstyp som man utgår från och justerar. Den fyller i alla sex stegen, planerad tid inräknad.' }
      ]
    },
    {
      grupp: 'Balansering',
      poster: [
        { ord: 'Balansering',
          text: 'Att fördela alla byggnaders rutintillfällen över årets veckor så att varje utförare får en jämn belastning. Balanseringen ändrar aldrig frekvenser, bara när i året tillfällena ligger.' },
        { ord: 'Kapacitet',
          text: 'Hur många dagar per vecka en utförare har för tillsyn och skötsel. Resten av veckan går till felavhjälpning och beställningar.' },
        { ord: 'Vecka utan tillsyn och skötsel',
          text: 'En vecka då inga rutintillfällen ska ligga, t.ex. under semestern.' },
        { ord: 'Besöksrytm',
          text: 'De veckor då en byggnad besöks. Förskjuts besöksrytmen följer byggnadens alla ronder med, så byggnaden fortsätter att besökas samlat.' },
        { ord: 'Rondserie',
          text: 'Alla rutintillfällen för en rond i en byggnad under året.' },
        { ord: 'Permanent ändring',
          text: 'En ändring av planeringen som gäller alla kommande tillfällen, t.ex. att förskjuta en besöksrytm eller en rondserie.' },
        { ord: 'Provisorisk flytt',
          text: 'Ett enskilt rutintillfälle flyttas till en annan vecka utan att planeringen ändras, t.ex. när det annars hade hamnat i semestern.' },
        { ord: 'Stryka',
          text: 'Att ta bort ett enskilt rutintillfälle som annars skulle hamna nära nästa ordinarie tillfälle, så att ingen behöver gå samma rond två gånger i följd.' }
      ]
    }
  ];
})();
