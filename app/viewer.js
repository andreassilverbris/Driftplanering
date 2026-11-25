/*
 * 3D-vy över en typbyggnad.
 * Bygger plan, rum, väggar, tak och installationer från datafilen och hanterar
 * navigering (översikt / uppifrån / inne i rum), lager och klick på installationer.
 */
(function () {
  'use strict';

  var DP = window.DP;
  var T = window.THREE;
  var VAGG_TJ = 0.15;

  var KATEGORIFARG = {
    brand:   0xd64541,
    el:      0xe0a526,
    vvs:     0x3b82c4,
    maskin:  0xe07b26,
    byggnad: 0x7d5ba6,
    ovrig:   0xa7adb4
  };
  var RUMFARG = {
    kommunikation: 0xe9e4da,
    personal:      0xdfe9e2,
    kontor:        0xe2e7f0,
    forrad:        0xece6d6,
    teknik:        0xe6e0ea,
    hangar:        0xd9dcdf
  };
  var GRON = 0x22b45a;

  function Viewer(container, byggnad, callbacks) {
    this.container = container;
    this.cb = callbacks || {};
    this.lager = { ytterVaggar: true, innerVaggar: true, tak: true, etiketter: true, rontgen: false };
    this.lage = 'oversikt';     // 'oversikt' | 'rum'
    this.anim = null;

    this._initRenderer();
    this._initInteraktion();
    this.sattByggnad(byggnad);
    this._loop();
  }

  // Byt byggnad: rensa scenen och bygg den nya
  Viewer.prototype.sattByggnad = function (byggnad) {
    var self = this;
    if (this.lage === 'rum') { this.lamnaRum(true); }
    if (this.root) { this.scene.remove(this.root); }
    if (this.markor) { this.scene.remove(this.markor); }
    this.b = byggnad;
    this.planGrupper = {};      // planId -> { grupp, ytter, inner, inst, etiketter, golv }
    this.rumIndex = {};
    this.planIndex = {};
    this.instObjekt = [];       // { inst, obj }
    // Installations-**id** -> 3D-objekt, inte installationsobjektet som nyckel. Byggnadens
    // data ligger i tillståndet och klonas vid varje historiksteg (beslut 71), så samma
    // installation är ett nytt objekt efter varje ändring och efter varje ångra. Identiteten
    // är id:t (beslut 2), och uppslaget måste följa den.
    this.objFor = {};
    this.pickbara = [];
    this.planSynligt = {};
    this.aktuelltRum = null;
    this.valdInst = null;
    this.blinkar = [];
    this.rumMarkering = null;
    this.b.plan.forEach(function (p) { self.planIndex[p.id] = p; self.planSynligt[p.id] = true; });
    // Nycklat på rummets nyckel (plan + rumsnummer), eftersom rumsnumret löper per plan och
    // inte är unikt i byggnaden (beslut 76). Installationernas `rum` bär samma nyckel.
    // Skalet står i `rum` för att kunna ritas, men är inget rum: det ligger inte i indexet,
    // så `visaRum`, `gaIn` och informationskortet kan inte råka peka på det (beslut 85).
    this.b.rum.forEach(function (r) { if (!r.skal) { self.rumIndex[DP.rumBeteckning(r)] = r; } });

    // Byggnadens mått räknas fram från rummen
    var M = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, topp: 0 };
    this.b.rum.forEach(function (r) {
      M.x0 = Math.min(M.x0, r.rect[0]); M.z0 = Math.min(M.z0, r.rect[1]);
      M.x1 = Math.max(M.x1, r.rect[2]); M.z1 = Math.max(M.z1, r.rect[3]);
      if (!r.iRum) { M.topp = Math.max(M.topp, self.planIndex[r.plan].elev + self._rumHojd(r)); }
    });
    // En byggnad utan rum – en nyskapad byggnad, innan plan och rum lästs in (beslut 69) –
    // har inga mått att räkna fram. Måtten sätts då till en liten ruta kring origo, så att
    // kameran, rutnätet och marken har något att utgå från och vyn visar en tom tomt i stället
    // för att räkna med Infinity och ge en svart ruta.
    if (!this.b.rum.length) { M.x0 = 0; M.z0 = 0; M.x1 = 12; M.z1 = 12; M.topp = 0; }
    // Ytterväggarna är de som ligger på byggnadens yttre gränser (vindsrum med indrag räknas inte)
    this.M = M;
    this.stil = this.b.stil || {};
    this.centrum = new T.Vector3((M.x0 + M.x1) / 2, 0, (M.z0 + M.z1) / 2);
    this.storlek = Math.max(M.x1 - M.x0, M.z1 - M.z0, 10);
    this.rutnat.position.set(this.centrum.x, -0.01, this.centrum.z);

    this._byggScen();
    this._uppdateraSynlighet();
    this.aterstallVy(false);
  };

  // ------------------------------------------------------------------
  // Grund
  // ------------------------------------------------------------------
  Viewer.prototype._initRenderer = function () {
    var w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0xf3f5f7);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new T.Scene();
    this.scene.fog = new T.Fog(0xf3f5f7, 180, 420);
    this.camera = new T.PerspectiveCamera(45, w / h, 0.05, 1000);

    this.scene.add(new T.HemisphereLight(0xffffff, 0xb8bec6, 0.75));
    var sol = new T.DirectionalLight(0xffffff, 0.55);
    sol.position.set(-40, 80, 60);
    this.scene.add(sol);
    var mot = new T.DirectionalLight(0xffffff, 0.2);
    mot.position.set(60, 40, -50);
    this.scene.add(mot);

    var mark = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshLambertMaterial({ color: 0xe4e8ea }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = -0.02;
    this.scene.add(mark);
    this.mark = mark;
    var rutnat = new T.GridHelper(300, 60, 0xd2d7db, 0xd9dee1);
    this.scene.add(rutnat);
    this.rutnat = rutnat;

    this.controls = new T.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false; // panorera längs marken
    this.controls.maxPolarAngle = Math.PI * 0.47; // aldrig under marken / upp och ner
    this.controls.minDistance = 4;
    this.controls.maxDistance = 220;

    var self = this;
    window.addEventListener('resize', function () { self._resize(); });
  };

  Viewer.prototype._resize = function () {
    var w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  Viewer.prototype._loop = function () {
    var self = this;
    function tick(t) {
      requestAnimationFrame(tick);
      self._stegaAnimation(t);
      self._stegaBlink(t);
      self._stegaMarkor(t);
      self.controls.update();
      self.renderer.render(self.scene, self.camera);
    }
    requestAnimationFrame(tick);
  };

  // ------------------------------------------------------------------
  // Scenbygge
  // ------------------------------------------------------------------
  function mat(color, opts) {
    var o = { color: color };
    if (opts) { for (var k in opts) { o[k] = opts[k]; } }
    return new T.MeshLambertMaterial(o);
  }
  function box(w, h, d, material) { return new T.Mesh(new T.BoxGeometry(w, h, d), material); }

  Viewer.prototype._rumHojd = function (r) { return r.hojd || this.b.konstanter.FRIHOJD; };

  Viewer.prototype._byggScen = function () {
    var self = this, K = this.b.konstanter;
    this.root = new T.Group();
    this.scene.add(this.root);

    var bjalkTj = K.BJALKLAG || 0.2;
    this.b.plan.forEach(function (p) {
      var g = { grupp: new T.Group(), ytter: new T.Group(), inner: new T.Group(), inst: new T.Group(), etiketter: new T.Group(), golv: new T.Group() };
      g.grupp.add(g.ytter, g.inner, g.inst, g.etiketter, g.golv);
      g.grupp.userData.planId = p.id;
      self.root.add(g.grupp);
      self.planGrupper[p.id] = g;

      // Bjälklag under planet: täcker planets rum
      var rr = self.b.rum.filter(function (r) { return r.plan === p.id && !r.iRum; });
      if (!rr.length) { return; }
      var x0 = Math.min.apply(null, rr.map(function (r) { return r.rect[0]; })), x1 = Math.max.apply(null, rr.map(function (r) { return r.rect[2]; }));
      var z0 = Math.min.apply(null, rr.map(function (r) { return r.rect[1]; })), z1 = Math.max.apply(null, rr.map(function (r) { return r.rect[3]; }));
      var bjalk = box(x1 - x0 + VAGG_TJ, bjalkTj, z1 - z0 + VAGG_TJ, mat(0xc9ced3));
      bjalk.position.set((x0 + x1) / 2, p.elev - bjalkTj / 2, (z0 + z1) / 2);
      g.golv.add(bjalk);
    });

    // Rum: golv + etiketter
    this.b.rum.forEach(function (r) { self._byggRumGolv(r); });

    // Väggar per plan
    this.b.plan.forEach(function (p) { self._byggVaggar(p); });

    // Tak: platt eller sadeltak. En byggnad utan rum har inget tak att rita – måtten är då
    // bara en tom tomt, och ett tak över ingenting hade sett ut som ett fel.
    this.takGrupp = new T.Group();
    var M = this.M, takFarg = this.stil.takFarg || 0x8d969e;
    if (!this.b.rum.length) {
      // inget tak – gruppen läggs till tom nedan, så att synlighetslagret har något att peka på
    } else if (this.stil.tak === 'sadel') {
      var s = this.stil.sadel, ut = 0.35;
      var form = new T.Shape();
      form.moveTo(-(M.z0 - ut), 0);
      form.lineTo(-(M.z1 + ut), 0);
      form.lineTo(-(M.z0 + M.z1) / 2, s.hojd);
      form.lineTo(-(M.z0 - ut), 0);
      var geo = new T.ExtrudeGeometry(form, { depth: M.x1 - M.x0 + 2 * ut, bevelEnabled: false });
      var tak = new T.Mesh(geo, mat(takFarg, { side: T.DoubleSide }));
      tak.rotation.y = Math.PI / 2;
      tak.position.set(M.x0 - ut, s.bas, 0);
      this.takGrupp.add(tak);
    } else {
      var platt = box(M.x1 - M.x0 + 0.3, 0.25, M.z1 - M.z0 + 0.3, mat(takFarg));
      platt.position.set((M.x0 + M.x1) / 2, M.topp + 0.12, (M.z0 + M.z1) / 2);
      this.takGrupp.add(platt);
    }
    this.root.add(this.takGrupp);

    // Dekor (fordon, markeringar) – inte installationer. Dekoren står på golvet i ett plan,
    // så den kräver att det finns ett.
    if (this.b.plan.length) {
      if (this.stil.dekor === 'hangar') { this._byggHangarDekor(); }
      if (this.stil.dekor === 'garage') { this._byggGarageDekor(); }
    }

    // Installationer
    this.b.installationer.forEach(function (inst) { self._byggInstallation(inst); });

    // Markör för vald installation
    var mk = new T.Mesh(new T.ConeGeometry(0.35, 0.8, 16), new T.MeshBasicMaterial({ color: 0x1f6feb, depthTest: false, transparent: true, opacity: 0.95 }));
    mk.rotation.x = Math.PI;
    mk.renderOrder = 1000;
    mk.visible = false;
    this.markor = mk;
    this.scene.add(mk);
  };

  Viewer.prototype._byggRumGolv = function (r) {
    var p = this.planIndex[r.plan], g = this.planGrupper[r.plan];
    var x0 = r.rect[0], z0 = r.rect[1], x1 = r.rect[2], z1 = r.rect[3];
    var golv = new T.Mesh(new T.PlaneGeometry(x1 - x0 - 0.02, z1 - z0 - 0.02), mat(RUMFARG[r.typ] || 0xdddddd));
    golv.rotation.x = -Math.PI / 2;
    golv.position.set((x0 + x1) / 2, p.elev + (r.iRum ? 0.025 : 0.012), (z0 + z1) / 2);
    golv.userData = { rum: r };
    g.golv.add(golv);
    // Skalet är planet innan rummen är inlästa (beslut 85). Det är inget rum: det går inte att
    // välja och inte att gå in i, eftersom det inte finns något därinne att se. Hade det varit
    // pickbart hade ett dubbelklick satt planeraren inne i ett tomt bjälklag utan väg tillbaka
    // till vad hon tittade på.
    if (!r.skal) { this.pickbara.push(golv); }

    // Etikett. Skalet bär planets benämning och inte en rumsbeteckning: det finns inget rum
    // 01-000, och en påhittad beteckning hade sett ut som ett inläst rum.
    var text = r.skal ? r.plan + ' – ' + r.namn : DP.rumBeteckning(r) + ' ' + r.namn;
    var skala = r.typ === 'hangar' ? 2.2 : 1;
    var sprite = textSprite(text, skala);
    sprite.position.set((x0 + x1) / 2, p.elev + 0.6 * skala, (z0 + z1) / 2);
    sprite.userData = { rumNyckel: DP.rumBeteckning(r) };
    g.etiketter.add(sprite);
  };

  function textSprite(text, skala) {
    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');
    var fs = 44;
    ctx.font = '600 ' + fs + 'px Segoe UI, Arial, sans-serif';
    var w = Math.ceil(ctx.measureText(text).width) + 36;
    c.width = w; c.height = fs + 26;
    ctx.font = '600 ' + fs + 'px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    rundRekt(ctx, 0, 0, c.width, c.height, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(60,70,80,0.25)'; ctx.lineWidth = 2;
    rundRekt(ctx, 1, 1, c.width - 2, c.height - 2, 13); ctx.stroke();
    ctx.fillStyle = '#2b3340';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 18, c.height / 2 + 2);
    var tex = new T.CanvasTexture(c);
    tex.anisotropy = 4;
    var s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false }));
    var hojd = 0.42 * skala;
    s.scale.set(hojd * c.width / c.height, hojd, 1);
    return s;
  }
  function rundRekt(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // Väggar: kanter från alla rum slås ihop per linje. Högre väggar (hangaren) tar
  // företräde så att samma vägg inte ritas två gånger.
  Viewer.prototype._byggVaggar = function (p) {
    var self = this, M = this.M, motX = this.stil.motX;
    var linjer = {};
    // Ett plan som bara är skal får väggar men **inga fönster** (beslut 85): fönstren hör till
    // rummen, och ett skal med fasad hade sett ut som en färdig byggnad i stället för som en
    // våning vars rum inte är inlästa än. Planet bär svaret från planlösningen; en handritad
    // byggnad saknar flaggan och har aldrig skal.
    var baraSkal = !!p.baraSkal;
    this.b.rum.filter(function (r) { return r.plan === p.id; }).forEach(function (r) {
      var x0 = r.rect[0], z0 = r.rect[1], x1 = r.rect[2], z1 = r.rect[3], h = self._rumHojd(r);
      var utan = r.utanVagg || [];
      var kanter = [
        { s: 'S', axel: 'z', c: z0, a0: x0, a1: x1 },
        { s: 'N', axel: 'z', c: z1, a0: x0, a1: x1 },
        { s: 'W', axel: 'x', c: x0, a0: z0, a1: z1 },
        { s: 'E', axel: 'x', c: x1, a0: z0, a1: z1 }
      ];
      kanter.forEach(function (k) {
        if (utan.indexOf(k.s) >= 0) { return; }
        var nyckel = k.axel + ':' + k.c;
        (linjer[nyckel] = linjer[nyckel] || { axel: k.axel, c: k.c, seg: [] }).seg.push({ a0: k.a0, a1: k.a1, h: h });
      });
    });

    var g = this.planGrupper[p.id];
    var yttre = mat(this.stil.ytterFarg || 0xd8d2c8), inre = mat(0xf1efea);
    var glas = new T.MeshLambertMaterial({ color: 0x7fa6c4, transparent: true, opacity: 0.55 });

    Object.keys(linjer).forEach(function (nyckel) {
      var L = linjer[nyckel];
      var hojder = L.seg.map(function (s) { return s.h; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return b - a; });
      var tackt = [];
      hojder.forEach(function (h) {
        var intervall = slaIhop(L.seg.filter(function (s) { return s.h === h; }).map(function (s) { return [s.a0, s.a1]; }));
        intervall.forEach(function (iv) {
          dra(iv, tackt).forEach(function (bit) {
            var ytter = (L.axel === 'x' && (L.c === M.x0 || L.c === M.x1)) || (L.axel === 'z' && (L.c === M.z0 || L.c === M.z1));
            var mot = motX !== undefined && !ytter && L.axel === 'x' && L.c === motX && p.elev > 0; // kontor som vetter mot hangaren
            var v = self._vagg(L.axel, L.c, bit[0], bit[1], p.elev, h, ytter ? yttre : inre);
            (ytter ? g.ytter : g.inner).add(v);
            if ((ytter || mot) && !baraSkal) { self._fonster(L.axel, L.c, bit[0], bit[1], p, h, glas, ytter ? g.ytter : g.inner, ytter); }
          });
        });
        tackt = slaIhop(tackt.concat(intervall));
      });
    });
  };

  function slaIhop(iv) {
    iv = iv.slice().sort(function (a, b) { return a[0] - b[0]; });
    var ut = [];
    iv.forEach(function (i) {
      if (ut.length && i[0] <= ut[ut.length - 1][1] + 1e-6) { ut[ut.length - 1][1] = Math.max(ut[ut.length - 1][1], i[1]); }
      else { ut.push([i[0], i[1]]); }
    });
    return ut;
  }
  function dra(iv, bort) {
    var bitar = [[iv[0], iv[1]]];
    bort.forEach(function (b) {
      var ny = [];
      bitar.forEach(function (x) {
        if (b[1] <= x[0] || b[0] >= x[1]) { ny.push(x); return; }
        if (b[0] > x[0]) { ny.push([x[0], b[0]]); }
        if (b[1] < x[1]) { ny.push([b[1], x[1]]); }
      });
      bitar = ny;
    });
    return bitar.filter(function (x) { return x[1] - x[0] > 0.05; });
  }

  Viewer.prototype._vagg = function (axel, c, a0, a1, elev, h, material) {
    var len = a1 - a0 + VAGG_TJ;
    var m = axel === 'z' ? box(len, h, VAGG_TJ, material) : box(VAGG_TJ, h, len, material);
    if (axel === 'z') { m.position.set((a0 + a1) / 2, elev + h / 2, c); }
    else { m.position.set(c, elev + h / 2, (a0 + a1) / 2); }
    m.userData = { vagg: true };
    this.pickbara.push(m);
    return m;
  };

  Viewer.prototype._fonster = function (axel, c, a0, a1, p, h, material, grupp, ytter) {
    var M = this.M, S = this.stil, F = S.fonster || {};
    var bredd = F.bredd || 1.4, steg = F.steg || 3, fh = F.hojd || 1.3, brost = F.brost || 0.9;
    if (S.motX !== undefined) {
      // Hangaren: höga fönsterband i hallen, portar på framsidan
      var arHangar = (axel === 'z' && a0 >= S.motX - 0.01) || (axel === 'x' && c === M.x1);
      if (arHangar) { bredd = 3.2; steg = 8; fh = 1.2; brost = 7.6; }
      if (axel === 'z' && c === M.z1 && a0 >= S.motX - 0.01) { return; }
    }
    if (S.portSida === 'N' && axel === 'z' && c === M.z1) { return; } // portar på framsidan
    if (p.elev < 0) { bredd = 1.0; fh = 0.5; brost = h - 0.8; steg = Math.max(steg, 4); } // källarfönster
    var langd = a1 - a0;
    var antal = Math.floor((langd + 0.01) / steg);
    if (antal < 1) { if (langd < bredd + 0.6) { return; } antal = 1; }
    var start = a0 + (langd - antal * steg) / 2 + steg / 2;
    var ut = (axel === 'x' ? (c === M.x0 ? -1 : 1) : (c === M.z0 ? -1 : 1)) * (VAGG_TJ / 2 + 0.01);
    if (!ytter) { ut = 0.09; }
    for (var i = 0; i < antal; i++) {
      var pos = start + i * steg;
      var f = axel === 'z' ? box(bredd, fh, 0.04, material) : box(0.04, fh, bredd, material);
      if (axel === 'z') { f.position.set(pos, p.elev + brost + fh / 2, c + ut); }
      else { f.position.set(c + ut, p.elev + brost + fh / 2, pos); }
      grupp.add(f);
      if (!ytter) {
        var f2 = f.clone(); f2.position[axel === 'x' ? 'x' : 'z'] = c - ut; grupp.add(f2);
      }
    }
  };

  Viewer.prototype._byggHangarDekor = function () {
    var g = this.planGrupper['01'].golv;
    var gul = new T.MeshBasicMaterial({ color: 0xe2b93b });
    // Uppställningsplatser
    for (var i = 0; i <= 8; i++) {
      var l = box(0.12, 0.01, 17, gul); l.position.set(12 + i * 8, 0.03, 21.5); g.add(l);
    }
    // Verkstadsyta
    [[44, 4.5, 60, 0.12], [44, 12.5, 60, 0.12]].forEach(function (a) {
      var m = box(a[2], 0.01, a[3], gul); m.position.set(a[0], 0.03, a[1]); g.add(m);
    });
    var vtext = textSprite('Verkstadsyta', 1.6);
    vtext.position.set(44, 0.9, 10.5);
    this.planGrupper['01'].etiketter.add(vtext);
    // Fordon (dekor, ej installationer)
    var hytt = mat(0x55624a), flak = mat(0x6b7a5c), dack = mat(0x2a2d30);
    [0, 1, 2, 4, 5, 7].forEach(function (i) {
      var x = 16 + i * 8;
      var f = new T.Group();
      var a = box(2.5, 2.3, 5.2, flak); a.position.set(0, 1.75, -1.0); f.add(a);
      var b = box(2.5, 2.7, 2.0, hytt); b.position.set(0, 1.95, 2.7); f.add(b);
      [-1.3, 1.3].forEach(function (dx) {
        [-2.6, 0.2, 2.8].forEach(function (dz) {
          var d = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.4, 14), dack);
          d.rotation.z = Math.PI / 2; d.position.set(dx, 0.5, dz); f.add(d);
        });
      });
      f.position.set(x, 0, 23.5);
      g.add(f);
    });
  };

  Viewer.prototype._byggGarageDekor = function () {
    var g = this.planGrupper[this.b.plan[0].id].golv, M = this.M;
    var farger = [0x3e5c8a, 0x8a3e3e], dack = mat(0x2a2d30), glas = mat(0x2c3540);
    [0.27, 0.73].forEach(function (andel, i) {
      var b = new T.Group();
      var kaross = box(1.8, 0.75, 4.4, mat(farger[i])); kaross.position.set(0, 0.6, 0); b.add(kaross);
      var kupe = box(1.6, 0.6, 2.3, glas); kupe.position.set(0, 1.25, -0.2); b.add(kupe);
      [-0.85, 0.85].forEach(function (dx) {
        [-1.4, 1.4].forEach(function (dz) {
          var d = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.25, 14), dack);
          d.rotation.z = Math.PI / 2; d.position.set(dx, 0.33, dz); b.add(d);
        });
      });
      b.position.set(M.x0 + (M.x1 - M.x0) * andel, 0, (M.z0 + M.z1) / 2 + 0.3);
      g.add(b);
    });
  };

  // ------------------------------------------------------------------
  // Installationer
  // ------------------------------------------------------------------
  Viewer.prototype._byggInstallation = function (inst) {
    var typ = DP.installationstyper[inst.typ];
    var r = this.rumIndex[inst.rum];
    var p = this.planIndex[r.plan];
    var farg = inst.signifikant ? KATEGORIFARG[typ.kategori] : KATEGORIFARG.ovrig;
    var obj = this._geometri(inst, farg);
    var montage = typ.montage;
    var rumH = this._rumHojd(r);

    var x = inst.x, z = inst.z, rotY = 0, y = p.elev + (inst.h || 0);
    if (montage === 'vagg' || montage === 'fasad' || montage === 'utsida') {
      var x0 = r.rect[0], z0 = r.rect[1], x1 = r.rect[2], z1 = r.rect[3];
      var kand = [
        { d: Math.abs(x - x0), s: 'W' }, { d: Math.abs(x - x1), s: 'E' },
        { d: Math.abs(z - z0), s: 'S' }, { d: Math.abs(z - z1), s: 'N' }
      ].sort(function (a, b) { return a.d - b.d; })[0].s;
      var djup = obj.userData.djup || 0.2;
      var off = VAGG_TJ / 2 + djup / 2 + 0.01;
      if (montage === 'fasad') { off = -(VAGG_TJ / 2 + 0.04); }
      if (montage === 'utsida') { off = -(VAGG_TJ / 2 + djup / 2 + 0.02); }
      if (kand === 'W') { x = x0 + off; rotY = Math.PI / 2; }
      if (kand === 'E') { x = x1 - off; rotY = -Math.PI / 2; }
      if (kand === 'S') { z = z0 + off; rotY = 0; }
      if (kand === 'N') { z = z1 - off; rotY = Math.PI; }
    } else if (montage === 'tak') {
      y = p.elev + rumH - (obj.userData.hojd || 0.1);
    }
    if (inst.typ === 'travers') { y = p.elev; x = 0; z = 0; rotY = 0; }
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;

    var self = this;
    var huvudMat = [];
    obj.traverse(function (m) {
      if (m.isMesh) {
        m.userData.inst = inst;
        self.pickbara.push(m);
        if (m.material.color && m.material.color.getHex() === farg && huvudMat.indexOf(m.material) < 0) { huvudMat.push(m.material); }
      }
    });
    obj.userData.inst = inst;
    obj.userData.huvudMat = huvudMat;
    obj.userData.grundFarg = farg;
    this.planGrupper[r.plan].inst.add(obj);
    this.instObjekt.push({ inst: inst, obj: obj, plan: r.plan });
    this.objFor[inst.id] = obj;
  };

  // Enkel geometri per typ. Objektets lokala +z pekar ut i rummet, origo vid golv/fäste.
  Viewer.prototype._geometri = function (inst, farg) {
    var g = new T.Group(), m = mat(farg), vit = mat(0xf4f4f2), gra = mat(0x8a9097), mork = mat(0x3c4248);
    var dj = 0.2, hj = 0.2;
    function add(mesh, x, y, z) { mesh.position.set(x || 0, y || 0, z || 0); g.add(mesh); return mesh; }
    switch (inst.typ) {
      case 'handbrandslackare':
        add(new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.5, 16), m), 0, 0.25, 0);
        add(new T.Mesh(new T.CylinderGeometry(0.03, 0.05, 0.1, 10), mork), 0, 0.55, 0);
        dj = 0.18; break;
      case 'brandpost':
        add(box(0.7, 0.75, 0.24, m), 0, 0.375, 0);
        add(box(0.5, 0.08, 0.01, vit), 0, 0.6, 0.125);
        dj = 0.24; break;
      case 'brandlarmscentral':
        add(box(0.6, 0.5, 0.16, m), 0, 0.25, 0);
        add(box(0.36, 0.14, 0.01, mork), 0, 0.33, 0.085);
        dj = 0.16; break;
      case 'utrymningsstege':
        add(box(0.55, 1.0, 0.14, m), 0, 0.5, 0);
        add(box(0.45, 0.04, 0.02, mork), 0, 0.85, 0.08);
        add(box(0.45, 0.04, 0.02, mork), 0, 0.5, 0.08);
        add(box(0.45, 0.04, 0.02, mork), 0, 0.15, 0.08);
        dj = 0.14; break;
      case 'huvudcentral':
        add(box(1.0, 1.9, 0.35, m), 0, 0.95, 0);
        add(box(0.9, 0.02, 0.01, mork), 0, 1.0, 0.18);
        dj = 0.35; break;
      case 'gruppcentral':
        add(box(0.6, 0.8, 0.14, m), 0, 0.4, 0);
        add(box(0.5, 0.02, 0.01, mork), 0, 0.45, 0.075);
        dj = 0.14; break;
      case 'apparatskap':
        add(box(1.2, 2.0, 0.4, m), 0, 1.0, 0);
        add(box(0.02, 1.8, 0.01, mork), 0, 1.0, 0.205);
        dj = 0.4; break;
      case 'jordfelsbrytare':
        add(box(0.2, 0.26, 0.12, m), 0, 0.13, 0);
        add(box(0.06, 0.06, 0.02, mork), 0, 0.15, 0.065);
        dj = 0.12; break;
      case 'luftbehandlingsaggregat':
        add(box(1.5, 2.0, 4.4, m), 0, 1.0, 0);
        add(box(1.52, 0.04, 4.42, mork), 0, 1.0, 0);
        [-1.5, -0.5, 0.5, 1.5].forEach(function (dz) {
          add(new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 1.3, 14), gra), 0, 2.65, dz);
        });
        break;
      case 'flaktluftvarmare':
        add(box(1.0, 0.7, 0.6, m), 0, 0.35, 0);
        add(box(0.8, 0.5, 0.01, mork), 0, 0.35, 0.305);
        dj = 0.6; break;
      case 'varmvattenberedare':
        add(new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 1.8, 20), m), 0, 0.9, 0);
        add(new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.06, 20), vit), 0, 1.8, 0);
        break;
      case 'kompressor':
        add(box(0.9, 1.1, 1.3, m), 0, 0.55, 0);
        add(box(0.6, 0.3, 0.01, mork), 0, 0.8, 0.655);
        break;
      case 'tryckkarl':
        add(new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 1.8, 20), m), 0, 1.15, 0);
        add(new T.Mesh(new T.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m), 0, 2.05, 0);
        [-0.3, 0.3].forEach(function (d) { add(box(0.06, 0.25, 0.06, mork), d, 0.12, 0); add(box(0.06, 0.25, 0.06, mork), 0, 0.12, d); });
        break;
      case 'personhiss':
        add(box(1.5, 2.3, 2.2, m), 0, 1.15, 0);
        add(box(0.04, 2.0, 0.9, gra), 0.77, 1.0, 0.4);
        break;
      case 'industriport':
        add(box(5.0, 4.5, 0.1, m), 0, 2.25, 0);
        for (var i = 1; i < 6; i++) { add(box(5.02, 0.03, 0.11, mat(0x5e4580)), 0, i * 0.75, 0); }
        dj = 0.1; break;
      case 'travers': {
        var K = this.b.konstanter;
        var ry = K.HANGARHOJD - 1.2;
        add(box(64, 0.35, 0.3, gra), 44, ry, 0.5);
        add(box(64, 0.35, 0.3, gra), 44, ry, 29.5);
        add(box(0.7, 0.9, 29.4, m), inst.x, ry + 0.1, 15);
        add(box(0.6, 0.9, 29.4, m), inst.x + 1.2, ry + 0.1, 15);
        add(box(1.6, 0.7, 1.2, mork), inst.x + 0.6, ry - 0.5, inst.z);
        add(box(0.05, 3.0, 0.05, mork), inst.x + 0.6, ry - 2.3, inst.z);
        break;
      }
      case 'pelarlyft':
        [[-1.8, -3.5], [1.8, -3.5], [-1.8, 3.5], [1.8, 3.5]].forEach(function (pp) {
          add(box(0.45, 2.6, 0.55, m), pp[0], 1.3, pp[1]);
          add(box(0.9, 0.06, 0.9, mork), pp[0], 0.03, pp[1]);
          add(box(0.6, 0.08, 0.25, mork), pp[0] * 0.8, 1.2, pp[1]);
        });
        break;

      // Ej signifikanta
      case 'lysrorsarmatur':
        add(box(1.2, 0.06, 0.25, mat(0xffffff, { emissive: 0x555555 })), 0, 0.03, 0); hj = 0.06; break;
      case 'vaggarmatur':
        add(box(0.3, 0.15, 0.08, mat(0xffffff, { emissive: 0x444444 })), 0, 0.075, 0); dj = 0.08; break;
      case 'vaggbrytare':
        add(box(0.09, 0.09, 0.03, m), 0, 0.045, 0); dj = 0.03; break;
      case 'vagguttag':
        add(box(0.09, 0.09, 0.03, m), 0, 0.045, 0); dj = 0.03; break;
      case 'rokdetektor':
        add(new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.04, 14), m), 0, 0.02, 0); hj = 0.04; break;
      case 'toalettstol':
        add(box(0.38, 0.42, 0.55, vit), 0, 0.21, 0);
        add(box(0.38, 0.4, 0.16, vit), 0, 0.6, -0.2);
        dj = 0.55; break;
      case 'handfat':
        add(box(0.5, 0.16, 0.4, vit), 0, 0.08, 0); dj = 0.4; break;
      case 'dusch':
        add(new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.03, 14), gra), 0, 2.05, 0.15);
        add(box(0.03, 1.1, 0.03, gra), 0, 1.5, 0);
        add(box(0.9, 0.02, 0.9, mat(0xcfd8dc)), 0, 0.01, 0.4);
        dj = 0.05; break;
      // Kasern och garage
      case 'undercentral':
        add(box(1.6, 1.6, 0.7, m), 0, 0.8, 0);
        [-0.5, 0, 0.5].forEach(function (dx) { add(new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.2, 10), gra), dx, 2.2, 0); });
        add(new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 1.0, 16), m), 1.1, 0.5, 0);
        dj = 0.7; break;
      case 'tvattmaskin':
        add(box(0.6, 0.85, 0.6, vit), 0, 0.425, 0);
        add(new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.02, 20), m), 0, 0.45, 0.31).rotation.x = Math.PI / 2;
        add(box(0.6, 0.06, 0.02, m), 0, 0.8, 0.31);
        dj = 0.6; break;
      case 'torkskap':
        add(box(0.6, 1.8, 0.6, vit), 0, 0.9, 0);
        add(box(0.5, 0.08, 0.02, m), 0, 1.65, 0.31);
        dj = 0.6; break;
      case 'skyddsrumsaggregat':
        add(box(0.9, 1.1, 0.45, m), 0, 0.55, 0);
        add(new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.8, 12), gra), 0, 1.5, 0);
        dj = 0.45; break;
      case 'brandgaslucka':
        add(box(1.2, 0.15, 1.2, m), 0, 0.075, 0);
        add(box(1.0, 0.02, 1.0, mat(0x9fc0d8)), 0, 0.0, 0);
        hj = 0.15; break;
      case 'dorrautomatik':
        add(box(0.9, 0.15, 0.15, m), 0, 0.075, 0);
        dj = 0.15; break;
      case 'nodbelysning':
        add(box(0.35, 0.14, 0.06, mat(0xffffff)), 0, 0.07, 0);
        add(box(0.25, 0.08, 0.01, m), 0, 0.07, 0.035);
        dj = 0.06; break;
      case 'garageport':
        add(box(2.5, 2.2, 0.08, m), 0, 1.1, 0);
        for (var gi = 1; gi < 4; gi++) { add(box(2.52, 0.03, 0.09, mat(0x8c939a)), 0, gi * 0.55, 0); }
        dj = 0.08; break;
      case 'ventilationsgaller':
        add(box(0.25, 0.2, 0.04, m), 0, 0.1, 0);
        dj = 0.04; break;
      default:
        add(box(0.3, 0.3, 0.3, m), 0, 0.15, 0);
    }
    g.userData.djup = dj;
    g.userData.hojd = hj;
    return g;
  };

  // ------------------------------------------------------------------
  // Synlighet / lager
  // ------------------------------------------------------------------
  Viewer.prototype.sattLager = function (namn, varde) {
    this.lager[namn] = varde;
    this._uppdateraSynlighet();
  };
  Viewer.prototype.sattPlanSynligt = function (planId, varde) {
    this.planSynligt[planId] = varde;
    this._uppdateraSynlighet();
  };
  Viewer.prototype._uppdateraSynlighet = function () {
    var self = this;
    Object.keys(this.planGrupper).forEach(function (id) {
      var g = self.planGrupper[id];
      g.grupp.visible = !!self.planSynligt[id];
      g.ytter.visible = self.lager.ytterVaggar;
      g.inner.visible = self.lager.innerVaggar;
      g.etiketter.visible = self.lager.etiketter && self.lage === 'oversikt';
    });
    // Taket visas bara om översta planet visas. En byggnad utan plan har inget översta plan
    // och inget tak (se _byggScen), så gruppen är tom och synligheten spelar ingen roll.
    var plan = this.b.plan;
    this.takGrupp.visible = this.lager.tak && (!plan.length || this.planSynligt[plan[plan.length - 1].id] !== false);
    // Marken döljs när man tittar ner i källaren (inget plan ovan mark visas)
    var kallareSynlig = plan.some(function (p) { return p.elev < 0 && self.planSynligt[p.id]; });
    var ovanMarkSynlig = plan.some(function (p) { return p.elev >= 0 && self.planSynligt[p.id]; });
    this.mark.visible = !(kallareSynlig && !ovanMarkSynlig);
    this.rutnat.visible = this.mark.visible;
    this._sattRontgen(this.lager.rontgen);
  };

  // Röntgen: signifikanta installationer syns genom väggar och tak
  Viewer.prototype._sattRontgen = function (pa) {
    this.instObjekt.forEach(function (o) {
      if (!o.inst.signifikant) { return; }
      o.obj.traverse(function (m) {
        if (m.isMesh) {
          m.material.depthTest = !pa;
          m.renderOrder = pa ? 500 : 0;
        }
      });
    });
  };

  // ------------------------------------------------------------------
  // Kamera
  // ------------------------------------------------------------------
  Viewer.prototype._flyg = function (pos, mal, ms, klar) {
    this.anim = {
      t0: performance.now(), ms: ms || 900,
      p0: this.camera.position.clone(), m0: this.controls.target.clone(),
      p1: pos.clone(), m1: mal.clone(), klar: klar
    };
  };
  Viewer.prototype._stegaAnimation = function (t) {
    var a = this.anim;
    if (!a) { return; }
    var k = Math.min(1, (performance.now() - a.t0) / a.ms);
    var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    this.camera.position.lerpVectors(a.p0, a.p1, e);
    this.controls.target.lerpVectors(a.m0, a.m1, e);
    if (k >= 1) { this.anim = null; if (a.klar) { a.klar(); } }
  };

  Viewer.prototype._oversiktsKontroller = function () {
    var c = this.controls;
    c.enableZoom = true; c.enablePan = true;
    c.minDistance = 4; c.maxDistance = 220;
    c.minPolarAngle = 0; c.maxPolarAngle = Math.PI * 0.47;
    c.rotateSpeed = 1;
  };

  Viewer.prototype.aterstallVy = function (animera) {
    if (this.lage === 'rum') { this.lamnaRum(true); }
    this._oversiktsKontroller();
    var S = Math.max(this.storlek, 18), c = this.centrum;
    var pos = new T.Vector3(c.x - 0.66 * S, 0.53 * S, c.z + 0.73 * S), mal = new T.Vector3(c.x - 0.03 * S, 3, c.z);
    if (animera === false) { this.camera.position.copy(pos); this.controls.target.copy(mal); }
    else { this._flyg(pos, mal, 900); }
  };

  Viewer.prototype.uppifran = function () {
    if (this.lage === 'rum') { this.lamnaRum(true); }
    this._oversiktsKontroller();
    var S = Math.max(this.storlek, 18), c = this.centrum;
    this._flyg(new T.Vector3(c.x, 1.45 * S, c.z + 0.5), new T.Vector3(c.x, 0, c.z), 900);
  };

  Viewer.prototype._rumCentrum = function (r) {
    var p = this.planIndex[r.plan];
    return new T.Vector3((r.rect[0] + r.rect[2]) / 2, p.elev, (r.rect[1] + r.rect[3]) / 2);
  };

  // Flyg till ett rum i översiktsläge (planet och planen under visas, planen ovanför släcks)
  // `nyckel` är rummets nyckel (plan + rumsnummer), som DP.rumBeteckning ger
  Viewer.prototype.visaRum = function (nyckel) {
    var r = this.rumIndex[nyckel];
    if (this.lage === 'rum') { this.lamnaRum(true); }
    this._visaPlanUpptill(r.plan);
    var c = this._rumCentrum(r);
    var storlek = Math.max(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]);
    var avst = Math.max(10, storlek * 1.4);
    this._flyg(new T.Vector3(c.x - avst * 0.45, c.y + avst * 0.9, c.z + avst * 0.75), new T.Vector3(c.x, c.y + 1, c.z), 900);
    this._valjRumMarkering(r);
  };

  Viewer.prototype._visaPlanUpptill = function (planId) {
    var self = this, ordning = this.b.plan.map(function (p) { return p.id; });
    var idx = ordning.indexOf(planId);
    ordning.forEach(function (id, i) { self.planSynligt[id] = i <= idx; });
    this._uppdateraSynlighet();
    if (this.cb.planAndrat) { this.cb.planAndrat(this.planSynligt); }
  };

  // Bygg om modellen på **samma** byggnads nya data, utan att flytta planeraren.
  //
  // `sattByggnad` är rätt när planeraren byter byggnad: då finns ingen vy att bevara, och allt
  // nollställs med flit. Men byggnadens data ligger i tillståndet och ändras i egna
  // historiksteg (beslut 71), och då står planeraren kvar vid sitt rum och sin installation.
  // Döper hon om ett rum ska hon se namnet ändras – inte kastas ut till översiktsvyn med alla
  // plan tända och markeringen borta. Det är själva poängen med att ändringen är ett steg som
  // går att ångra: man ser vad man gjorde.
  //
  // Därför sparas det som är planerarens vy över ombyggnaden: kameran, vilka plan som syns,
  // rumsläget och den markerade installationen. Allt annat byggs om från grunden ur datan.
  Viewer.prototype.byggOmByggnad = function (byggnad) {
    var kamera = this.camera.position.clone();
    var mal = this.controls.target.clone();
    var synliga = this.planSynligt;
    var lage = this.lage;
    var rumNyckel = this.aktuelltRum && DP.rumBeteckning(this.aktuelltRum);
    var valdId = this.valdInst && this.valdInst.id;
    // Byggnaden kan ha bytt storlek under ombyggnaden – i steget Plan växer den ett plan i
    // taget (beslut 85). Kameran ska stå kvar, men avståndet mäts mot den byggnad som fanns:
    // behålls det oförändrat när byggnaden blir dubbelt så stor står planeraren plötsligt inuti
    // en vägg. Riktningen och det hon tittar mot är hennes vy; avståndet är bara en följd av
    // hur stort huset är, och det skalas om med huset.
    var gammalStorlek = this.storlek;
    var gammaltCentrum = this.centrum.clone();

    this.sattByggnad(byggnad);

    var skala = gammalStorlek > 0 ? this.storlek / gammalStorlek : 1;
    if (skala !== 1) {
      kamera.sub(gammaltCentrum).multiplyScalar(skala).add(this.centrum);
      mal.sub(gammaltCentrum).multiplyScalar(skala).add(this.centrum);
    }

    // Plan som finns kvar behåller sin synlighet; ett nytt plan börjar synligt.
    var self = this;
    Object.keys(synliga).forEach(function (id) {
      if (self.planIndex[id]) { self.planSynligt[id] = synliga[id]; }
    });
    if (lage === 'rum' && this.rumIndex[rumNyckel]) {
      // Rumsläget sätter sin egen kamera och plansynlighet, så det får gå före de sparade.
      this.gaIn(rumNyckel);
    } else {
      this._uppdateraSynlighet();
      this.camera.position.copy(kamera);
      this.controls.target.copy(mal);
      this.controls.update();
    }
    if (this.cb.planAndrat) { this.cb.planAndrat(this.planSynligt); }
    // Installationen är ett nytt objekt efter ombyggnaden, så den slås upp på sitt id. Är den
    // borta ur datan tar `valjInstallation` själv bort markeringen.
    if (valdId) {
      var ny = this.b.installationer.filter(function (i) { return i.id === valdId; })[0];
      this.valjInstallation(ny || null, false);
    }
  };

  // Gå in i ett rum: stå i ögonhöjd och se dig omkring
  Viewer.prototype.gaIn = function (nyckel) {
    var r = this.rumIndex[nyckel];
    this.lage = 'rum';
    this.aktuelltRum = r;
    this._visaPlanUpptill(r.plan);
    var c = this._rumCentrum(r);
    var oga = new T.Vector3(c.x, c.y + 1.6, c.z);
    // Titta mot den längsta riktningen i rummet
    var w = r.rect[2] - r.rect[0], d = r.rect[3] - r.rect[1];
    var blick = w > d ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, -1);
    var start = oga.clone().sub(blick.clone().multiplyScalar(Math.min(w, d) * 0.3));
    var c2 = this.controls;
    c2.enableZoom = false; c2.enablePan = false;
    c2.minDistance = 0.01; c2.maxDistance = 1000;
    c2.minPolarAngle = Math.PI * 0.15; c2.maxPolarAngle = Math.PI * 0.85;
    c2.rotateSpeed = -0.35; // dra = vrid huvudet
    this._uppdateraSynlighet();
    this._flyg(start, start.clone().add(blick.multiplyScalar(0.1)), 1000);
    if (this.cb.lageAndrat) { this.cb.lageAndrat('rum', r); }
  };

  Viewer.prototype.lamnaRum = function (tyst) {
    if (this.lage !== 'rum') { return; }
    var r = this.aktuelltRum;
    this.lage = 'oversikt';
    this.aktuelltRum = null;
    this._oversiktsKontroller();
    this._uppdateraSynlighet();
    if (!tyst && r) {
      var c = this._rumCentrum(r);
      this._flyg(new T.Vector3(c.x - 14, c.y + 22, c.z + 20), new T.Vector3(c.x, c.y + 1, c.z), 900);
    }
    if (this.cb.lageAndrat) { this.cb.lageAndrat('oversikt', null); }
  };

  // ------------------------------------------------------------------
  // Val och markering
  // ------------------------------------------------------------------
  Viewer.prototype.valjInstallation = function (inst, flyg) {
    this.valdInst = inst;
    if (!inst) { this.markor.visible = false; return; }
    var o = this.objFor[inst.id];
    // Installationen kan vara borta ur byggnadens data, eller ligga i ett plan som ännu inte
    // byggts. Då finns inget att markera.
    if (!o) { this.valdInst = null; this.markor.visible = false; return; }
    var r = this.rumIndex[inst.rum];
    var pos = new T.Vector3();
    var bb = new T.Box3().setFromObject(o);
    bb.getCenter(pos);
    this.markor.userData.bas = new T.Vector3(pos.x, bb.max.y + 0.7, pos.z);
    this.markor.visible = true;
    if (flyg) {
      if (this.lage === 'rum' && this.aktuelltRum && DP.rumBeteckning(this.aktuelltRum) === DP.rumBeteckning(r)) { return; }
      if (this.lage === 'rum') { this.lamnaRum(true); }
      this._visaPlanUpptill(r.plan);
      var dim = new T.Vector3(); bb.getSize(dim);
      var avst = Math.max(6, Math.min(45, dim.length() * 2.2));
      this._flyg(new T.Vector3(pos.x - avst * 0.6, pos.y + avst * 0.8, pos.z + avst * 0.9), pos, 900);
    }
  };

  Viewer.prototype._stegaMarkor = function (t) {
    if (!this.valdInst || !this.markor.userData.bas) { this.markor.visible = false; return; }
    var vr = this.rumIndex[this.valdInst.rum];
    this.markor.visible = !!(vr && this.planSynligt[vr.plan]);
    var b = this.markor.userData.bas;
    this.markor.position.set(b.x, b.y + Math.sin(t / 220) * 0.15, b.z);
    var skala = this.lage === 'rum' ? 0.5 : 1;
    this.markor.scale.set(skala, skala, skala);
  };

  Viewer.prototype._valjRumMarkering = function (r) {
    if (this.rumMarkering) { this.rumMarkering.parent.remove(this.rumMarkering); this.rumMarkering = null; }
    if (!r) { return; }
    var p = this.planIndex[r.plan];
    var w = r.rect[2] - r.rect[0], d = r.rect[3] - r.rect[1];
    var geo = new T.EdgesGeometry(new T.BoxGeometry(w - 0.1, 0.05, d - 0.1));
    var l = new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0x1f6feb }));
    l.position.set(r.rect[0] + w / 2, p.elev + 0.05, r.rect[1] + d / 2);
    this.planGrupper[r.plan].golv.add(l);
    this.rumMarkering = l;
  };

  // Installationer med kopplad åtgärd blir gröna
  // Symbol ✎ ovanför installationer med avvikande åtgärdstext (syns genom väggar)
  Viewer.prototype.sattAvvikande = function (idSet) {
    var self = this;
    if (!this._avvikTex) {
      var c = document.createElement('canvas'); c.width = c.height = 96;
      var x = c.getContext('2d');
      x.fillStyle = '#e8a317'; x.beginPath(); x.arc(48, 48, 44, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 6; x.stroke();
      x.fillStyle = '#fff'; x.font = 'bold 56px Segoe UI Symbol, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('✎', 48, 52);
      this._avvikTex = new T.CanvasTexture(c);
    }
    this.instObjekt.forEach(function (o) {
      if (!o.inst.signifikant) { return; }
      var pa = !!idSet[o.inst.id];
      var s = o.obj.userData.avvikSprite;
      if (pa && !s) {
        // Fast storlek på skärmen så att symbolen syns även på avstånd
        s = new T.Sprite(new T.SpriteMaterial({ map: self._avvikTex, depthTest: false, depthWrite: false, sizeAttenuation: false }));
        s.renderOrder = 950;
        var bb = new T.Box3().setFromObject(o.obj), c = new T.Vector3();
        bb.getCenter(c);
        s.position.set(c.x, bb.max.y + 0.3, c.z);
        s.scale.set(0.032, 0.032, 1);
        o.obj.parent.add(s);
        o.obj.userData.avvikSprite = s;
      }
      if (s) { s.visible = pa; }
    });
  };

  Viewer.prototype.sattKopplade = function (idSet) {
    this.instObjekt.forEach(function (o) {
      if (!o.inst.signifikant) { return; }
      var gron = !!idSet[o.inst.id];
      o.obj.userData.huvudMat.forEach(function (m) { m.color.setHex(gron ? GRON : o.obj.userData.grundFarg); });
    });
  };

  // Installationens mittpunkt i skärmkoordinater (för animeringar)
  Viewer.prototype.skarmPos = function (inst) {
    var o = this.objFor[inst.id];
    if (!o) { return null; }
    var r = this.rumIndex[inst.rum];
    if (!this.planSynligt[r.plan]) { return null; }
    var c = new T.Vector3();
    new T.Box3().setFromObject(o).getCenter(c);
    c.project(this.camera);
    if (c.z > 1 || c.x < -1.05 || c.x > 1.05 || c.y < -1.05 || c.y > 1.05) { return null; }
    var rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (c.x + 1) / 2 * rect.width, y: rect.top + (1 - c.y) / 2 * rect.height };
  };

  // Blinka installationer genom väggar och tak (grönt när åtgärder kopplas)
  Viewer.prototype.blinka = function (instLista, ms, farg) {
    var self = this, nu = performance.now();
    var BLINK = farg || GRON;
    instLista.forEach(function (inst) {
      var o = self.objFor[inst.id];
      if (!o) { return; }
      var r = self.rumIndex[inst.rum];
      if (!self.planSynligt[r.plan]) { return; }
      // Grön kopia som ritas ovanpå allt (syns genom väggar och tak)
      var kopia = new T.Group();
      kopia.position.copy(o.position); kopia.rotation.copy(o.rotation);
      o.children.forEach(function (m) {
        if (!m.isMesh) { return; }
        var g = new T.Mesh(m.geometry, new T.MeshBasicMaterial({ color: BLINK, transparent: true, opacity: 0, depthTest: false }));
        g.position.copy(m.position); g.rotation.copy(m.rotation); g.scale.copy(m.scale).multiplyScalar(1.15);
        g.renderOrder = 900;
        kopia.add(g);
      });
      // Gloria runt installationen så att även små objekt syns på avstånd
      var bb = new T.Box3().setFromObject(o), storlek = new T.Vector3();
      bb.getSize(storlek);
      var radie = Math.max(0.7, Math.min(3, storlek.length() * 0.55));
      var gloria = new T.Mesh(new T.SphereGeometry(radie, 20, 14), new T.MeshBasicMaterial({ color: BLINK, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      gloria.userData.gloria = true;
      gloria.renderOrder = 899;
      var centrum = new T.Vector3(); bb.getCenter(centrum);
      o.parent.worldToLocal(centrum);
      gloria.position.copy(centrum);
      o.parent.add(kopia);
      o.parent.add(gloria);
      self.blinkar.push({ obj: kopia, t0: nu, ms: ms || 1600 });
      self.blinkar.push({ obj: gloria, t0: nu, ms: ms || 1600, gloria: true });
    });
  };
  Viewer.prototype._stegaBlink = function () {
    var nu = performance.now();
    this.blinkar = this.blinkar.filter(function (b) {
      var k = (nu - b.t0) / b.ms;
      if (k >= 1) { b.obj.parent.remove(b.obj); return false; }
      var op = Math.sin(k * Math.PI * 3) * 0.5 + 0.5; // pulserar
      op *= (1 - Math.max(0, k - 0.7) / 0.3);
      var bas = b.gloria ? 0.08 : 0.25, amp = b.gloria ? 0.3 : 0.7;
      b.obj.traverse(function (m) { if (m.isMesh) { m.material.opacity = bas + op * amp; } });
      return true;
    });
  };

  // ------------------------------------------------------------------
  // Mus
  // ------------------------------------------------------------------
  Viewer.prototype._initInteraktion = function () {
    var self = this, el = this.renderer.domElement;
    var ray = new T.Raycaster(), mus = new T.Vector2(), ned = null;

    function traffa(ev) {
      var rect = el.getBoundingClientRect();
      mus.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mus.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(mus, self.camera);
      var traffar = ray.intersectObjects(self.pickbara, false);
      for (var i = 0; i < traffar.length; i++) {
        var o = traffar[i].object;
        if (!synligKedja(o)) { continue; }
        if (self.lager.rontgen) {
          // I röntgenläge prioriteras signifikanta installationer framför väggar
          var sig = traffar.filter(function (t) { return synligKedja(t.object) && t.object.userData.inst && t.object.userData.inst.signifikant; })[0];
          if (sig) { return sig.object; }
        }
        return o;
      }
      return null;
    }
    function synligKedja(o) {
      while (o) { if (!o.visible) { return false; } o = o.parent; }
      return true;
    }

    el.addEventListener('pointerdown', function (ev) { ned = { x: ev.clientX, y: ev.clientY }; });
    el.addEventListener('pointermove', function (ev) {
      if (ev.buttons) { return; }
      var o = traffa(ev);
      var inst = o && o.userData.inst;
      el.style.cursor = (inst && inst.signifikant) ? 'pointer' : 'default';
      if (self.cb.hover) { self.cb.hover(inst || null, o && o.userData.rum, ev); }
    });
    el.addEventListener('pointerleave', function () { if (self.cb.hover) { self.cb.hover(null, null, null); } });
    el.addEventListener('click', function (ev) {
      if (!ned || Math.abs(ev.clientX - ned.x) > 4 || Math.abs(ev.clientY - ned.y) > 4) { return; }
      var o = traffa(ev);
      if (!o) { return; }
      var inst = o.userData.inst;
      if (inst) {
        if (inst.signifikant && self.cb.valtInstallation) { self.cb.valtInstallation(inst); }
        return; // ej signifikanta går inte att klicka på
      }
      if (o.userData.rum && self.cb.valtRum) {
        self._valjRumMarkering(o.userData.rum);
        self.cb.valtRum(o.userData.rum);
      }
    });
    el.addEventListener('dblclick', function (ev) {
      var o = traffa(ev);
      if (o && o.userData.rum) { self.gaIn(DP.rumBeteckning(o.userData.rum)); }
    });
    window.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && self.lage === 'rum') { self.lamnaRum(); }
    });
  };

  window.DP = window.DP || {};
  window.DP.Viewer = Viewer;
  window.DP.KATEGORIFARG = KATEGORIFARG;
  window.DP.GRON = GRON;
})();
