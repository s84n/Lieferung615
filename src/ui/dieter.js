// Dieter, der Chef: Avatar als Vektorgrafik (ca. 50, kantiges, schlankes Gesicht mit leicht
// eingefallenen Wangen, kurze schwarz-graue Haare, oben leicht gegelt, Seiten kurz aber nicht rasiert)
export const DIETER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="dbg" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#5d7488"/><stop offset="1" stop-color="#25313d"/>
    </radialGradient>
    <linearGradient id="dskin" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#cf9b76"/><stop offset="0.45" stop-color="#e3b28c"/><stop offset="1" stop-color="#c9926c"/>
    </linearGradient>
    <linearGradient id="dhair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2b2e"/><stop offset="1" stop-color="#3d3f43"/>
    </linearGradient>
    <linearGradient id="dside" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4b4d52"/><stop offset="1" stop-color="#8d9096"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#dbg)"/>

  <!-- Hals + Hemd (Poloshirt in Firmenrot) -->
  <path d="M84 146 L83 186 L117 186 L116 146 Z" fill="#c38d68"/>
  <path d="M93 166 Q100 171 107 166" stroke="#a87553" stroke-width="1.6" fill="none" opacity="0.7"/>
  <path d="M22 200 Q28 176 62 169 L86 164 L100 186 L114 164 L138 169 Q172 176 178 200 Z" fill="#b5002f"/>
  <path d="M86 164 L100 186 L92 192 L78 170 Z" fill="#8a0024"/>
  <path d="M114 164 L100 186 L108 192 L122 170 Z" fill="#8a0024"/>
  <path d="M100 186 L100 200" stroke="#7a001f" stroke-width="2"/>
  <circle cx="100" cy="193" r="1.8" fill="#f2f2f2"/>

  <!-- Ohren -->
  <ellipse cx="62" cy="106" rx="7" ry="13" fill="#d29f7a"/>
  <ellipse cx="138" cy="106" rx="7" ry="13" fill="#c9926c"/>
  <path d="M62 99 Q58 106 62 113" stroke="#a87553" stroke-width="1.6" fill="none"/>
  <path d="M138 99 Q142 106 138 113" stroke="#a87553" stroke-width="1.6" fill="none"/>

  <!-- Gesicht: kantiger Kiefer, schmales Kinn, eingefallene Wangen -->
  <path d="M67 74 Q100 52 133 74 L136 100 Q135 113 130 125 L126 142 L113 158 Q100 164 87 158 L74 142 L70 125 Q65 113 64 100 Z" fill="url(#dskin)"/>
  <!-- Wangen-Schatten unter den Wangenknochen -->
  <path d="M70 112 Q76 122 76 136 Q72 130 68 122 Z" fill="#a8754f" opacity="0.45"/>
  <path d="M130 112 Q124 122 124 136 Q128 130 132 122 Z" fill="#a8754f" opacity="0.45"/>
  <!-- Kieferkante und Kinn -->
  <path d="M74 142 L87 158 Q100 164 113 158 L126 142" stroke="#a8754f" stroke-width="2" fill="none" opacity="0.55"/>
  <path d="M95 155 Q100 157.5 105 155" stroke="#a8754f" stroke-width="1.4" fill="none" opacity="0.55"/>
  <!-- leichter Bartschatten -->
  <path d="M75 134 L87 157 Q100 163 113 157 L125 134 Q118 149 100 151 Q82 149 75 134 Z" fill="#5a5552" opacity="0.14"/>
  <!-- Stirnfalten -->
  <path d="M84 77 Q100 73 116 77" stroke="#b9845e" stroke-width="1.3" fill="none" opacity="0.6"/>
  <path d="M88 82 Q100 79 112 82" stroke="#b9845e" stroke-width="1.1" fill="none" opacity="0.5"/>

  <!-- Augenbrauen: kräftig, gerade, grau-schwarz -->
  <path d="M71 92 L92 88 L93 92.5 L72 96 Z" fill="#35363a"/>
  <path d="M129 92 L108 88 L107 92.5 L128 96 Z" fill="#35363a"/>
  <!-- Augen -->
  <path d="M75 101 Q83 96.5 91 101 Q83 104.5 75 101 Z" fill="#f1ece4"/>
  <path d="M109 101 Q117 96.5 125 101 Q117 104.5 109 101 Z" fill="#f1ece4"/>
  <circle cx="83" cy="100.6" r="2.9" fill="#4d6070"/><circle cx="83" cy="100.6" r="1.3" fill="#111"/>
  <circle cx="117" cy="100.6" r="2.9" fill="#4d6070"/><circle cx="117" cy="100.6" r="1.3" fill="#111"/>
  <path d="M74.5 100.5 Q83 95.5 91.5 100.5" stroke="#4a3426" stroke-width="1.8" fill="none"/>
  <path d="M108.5 100.5 Q117 95.5 125.5 100.5" stroke="#4a3426" stroke-width="1.8" fill="none"/>
  <!-- Tränensäcke + Krähenfüße -->
  <path d="M77 106 Q83 108.5 89 106" stroke="#b07a55" stroke-width="1.1" fill="none" opacity="0.7"/>
  <path d="M111 106 Q117 108.5 123 106" stroke="#b07a55" stroke-width="1.1" fill="none" opacity="0.7"/>
  <path d="M72 100 L68 98 M72 102.5 L68 103.5" stroke="#b07a55" stroke-width="1" opacity="0.7"/>
  <path d="M128 100 L132 98 M128 102.5 L132 103.5" stroke="#b07a55" stroke-width="1" opacity="0.7"/>

  <!-- Nase: gerade, markant -->
  <path d="M99 98 L96.5 121" stroke="#b07a55" stroke-width="1.6" fill="none" opacity="0.8"/>
  <path d="M93 122 Q96 126.5 100 125 Q104 126.5 107 122" stroke="#9c6a48" stroke-width="1.8" fill="none"/>
  <ellipse cx="96" cy="123.2" rx="1.6" ry="1" fill="#7a4e34"/><ellipse cx="104" cy="123.2" rx="1.6" ry="1" fill="#7a4e34"/>
  <!-- Nasolabialfalten -->
  <path d="M91.5 125 Q87 131 88.5 138" stroke="#a8754f" stroke-width="1.5" fill="none" opacity="0.55"/>
  <path d="M108.5 125 Q113 131 111.5 138" stroke="#a8754f" stroke-width="1.5" fill="none" opacity="0.55"/>
  <!-- Mund: schmale Lippen, leicht verschmitzt -->
  <path d="M91 140 Q100 142.5 110 138.5" stroke="#7d4434" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M94 144.5 Q100.5 146.5 107 143.5" stroke="#b07a55" stroke-width="1.3" fill="none" opacity="0.55"/>

  <!-- Haare: Seiten kurz (nicht rasiert), an den Schläfen grau -->
  <path d="M63 101 L60 82 Q60 62 72 54 L80 60 Q70 66 68 80 L67 97 Z" fill="url(#dside)"/>
  <path d="M137 101 L140 82 Q140 62 128 54 L120 60 Q130 66 132 80 L133 97 Z" fill="url(#dside)"/>
  <!-- Oberkopf: kurz, vorne leicht nach oben gegelt (weiche Büschel statt Stacheln) -->
  <path d="M66 80 Q61 62 72 52 Q76 43 85 43 Q88 35 96 37 Q100 31 107 34 Q114 32 117 39 Q125 39 127 47 Q137 55 134 80 Q128 70 116 67 Q108 63 100 64 Q86 64 78 69 Q70 73 66 80 Z" fill="url(#dhair)"/>
  <!-- Textur: Strähnen, nach oben/vorne gestellt -->
  <path d="M84 52 Q86 46 89 43 M93 49 Q95 42 99 38 M102 48 Q104 41 108 36 M110 50 Q113 44 117 41 M118 54 Q121 49 125 47" stroke="#1b1c1f" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.55"/>
  <!-- grau meliert -->
  <path d="M88 53 Q90 47 93 44 M98 50 Q100 44 103 40 M107 51 Q109 46 112 43 M77 62 Q81 57 87 57 M114 57 Q121 57 126 63" stroke="#8e9197" stroke-width="1.4" fill="none" opacity="0.7" stroke-linecap="round"/>
  <!-- Glanz vom Gel -->
  <path d="M90 46 Q101 40 113 45" stroke="#a6aab1" stroke-width="2.2" fill="none" opacity="0.35" stroke-linecap="round"/>
</svg>`;

export const DIETER_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DIETER_SVG)}`;

let imgPromise = null;
export function dieterImage() {
  imgPromise ??= new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = DIETER_URL;
  });
  return imgPromise;
}
