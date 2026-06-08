const TEAM_SECTIONS = [
  ["ALG", "Argelia"],
  ["ARG", "Argentina"],
  ["AUS", "Australia"],
  ["AUT", "Austria"],
  ["BEL", "Belgica"],
  ["BIH", "Bosnia e Herzegovina"],
  ["BRA", "Brasil"],
  ["CAN", "Canada"],
  ["CIV", "Costa do Marfim"],
  ["COD", "RD Congo"],
  ["COL", "Colombia"],
  ["CPV", "Cabo Verde"],
  ["CRO", "Croacia"],
  ["CUW", "Curacao"],
  ["CZE", "Tchequia"],
  ["ECU", "Equador"],
  ["EGY", "Egito"],
  ["ENG", "Inglaterra"],
  ["ESP", "Espanha"],
  ["FRA", "Franca"],
  ["GER", "Alemanha"],
  ["GHA", "Gana"],
  ["HAI", "Haiti"],
  ["IRN", "Ira"],
  ["IRQ", "Iraque"],
  ["JOR", "Jordania"],
  ["JPN", "Japao"],
  ["KOR", "Coreia do Sul"],
  ["KSA", "Arabia Saudita"],
  ["MAR", "Marrocos"],
  ["MEX", "Mexico"],
  ["NED", "Paises Baixos"],
  ["NOR", "Noruega"],
  ["NZL", "Nova Zelandia"],
  ["PAN", "Panama"],
  ["PAR", "Paraguai"],
  ["POR", "Portugal"],
  ["QAT", "Catar"],
  ["RSA", "Africa do Sul"],
  ["SCO", "Escocia"],
  ["SEN", "Senegal"],
  ["SUI", "Suica"],
  ["SWE", "Suecia"],
  ["TUN", "Tunisia"],
  ["TUR", "Turquia"],
  ["URU", "Uruguai"],
  ["USA", "Estados Unidos"],
  ["UZB", "Uzbequistao"]
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
