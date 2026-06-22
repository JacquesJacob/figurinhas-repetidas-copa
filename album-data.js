const TEAM_SECTIONS = [
  ["MEX", "Mexico"],
  ["RSA", "Africa do Sul"],
  ["KOR", "Coreia do Sul"],
  ["CZE", "Tchequia"],
  ["CAN", "Canada"],
  ["BIH", "Bosnia e Herzegovina"],
  ["QAT", "Catar"],
  ["SUI", "Suica"],
  ["BRA", "Brasil"],
  ["MAR", "Marrocos"],
  ["HAI", "Haiti"],
  ["SCO", "Escocia"],
  ["USA", "Estados Unidos"],
  ["PAR", "Paraguai"],
  ["AUS", "Australia"],
  ["TUR", "Turquia"],
  ["GER", "Alemanha"],
  ["CUW", "Curacao"],
  ["CIV", "Costa do Marfim"],
  ["ECU", "Equador"],
  ["NED", "Paises Baixos"],
  ["JPN", "Japao"],
  ["SWE", "Suecia"],
  ["TUN", "Tunisia"],
  ["BEL", "Belgica"],
  ["EGY", "Egito"],
  ["IRN", "Ira"],
  ["IRQ", "Iraque"],
  ["NZL", "Nova Zelandia"],
  ["ESP", "Espanha"],
  ["CPV", "Cabo Verde"],
  ["KSA", "Arabia Saudita"],
  ["URU", "Uruguai"],
  ["FRA", "Franca"],
  ["SEN", "Senegal"],
  ["NOR", "Noruega"],
  ["ARG", "Argentina"],
  ["ALG", "Argelia"],
  ["AUT", "Austria"],
  ["JOR", "Jordania"],
  ["POR", "Portugal"],
  ["COD", "RD Congo"],
  ["UZB", "Uzbequistao"],
  ["COL", "Colombia"],
  ["ENG", "Inglaterra"],
  ["CRO", "Croacia"],
  ["GHA", "Gana"],
  ["PAN", "Panama"]
];

function buildIntroSection() {
  const sections = [
    {
      id: "PANINI",
      name: "Panini",
      stickers: [
        {
          code: "PANINI 1",
          number: 1,
          label: "Panini 1",
          title: "Logo Panini"
        }
      ]
    },
    {
      id: "FWC",
      name: "World Cup History",
      stickers: Array.from({ length: 19 }, (_, index) => ({
        code: `FWC ${index + 1}`,
        number: index + 1,
        label: `FWC ${index + 1}`,
        title: `Especial FWC ${index + 1}`
      }))
    }
  ];

  return sections;
}

function buildTeamSections() {
  return TEAM_SECTIONS.map(([id, name]) => ({
    id,
    name,
    stickers: Array.from({ length: 20 }, (_, index) => ({
      code: `${id} ${index + 1}`,
      number: index + 1,
      label: `${id} ${index + 1}`,
      title: `${name} ${index + 1}`
    }))
  }));
}

function buildAlbumDataset() {
  const sections = [...buildIntroSection(), ...buildTeamSections()];
  const stickers = sections.flatMap((section) =>
    section.stickers.map((sticker) => ({
      ...sticker,
      sectionId: section.id,
      sectionName: section.name
    }))
  );

  return {
    meta: {
      albumName: "Panini FIFA World Cup 2026",
      totalStickers: stickers.length,
      sourceNote:
        "Catalogo inicial baseado em checklist publica do album 2026 encontrada em fontes de terceiros em 7 de junho de 2026.",
      sourceLinks: [
        "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/fifa-panini-collection-app",
        "https://scanini.app/albums/world-cup-2026",
        "https://scanini.app/panini-world-cup-2026-checklist-pdf"
      ]
    },
    sections,
    stickers
  };
}

module.exports = {
  buildAlbumDataset
};
