const { buildMatchList } = require("./lib/core");

const ana = {
  id: "ana-1",
  name: "Ana",
  email: "ana@example.com",
  apartment: "101",
  block: "A",
  phone: "11999990001",
  missingStickers: ["BRA 2", "ARG 10", "FWC 3"],
  duplicateStickers: ["USA 4", "PANINI 1"]
};

const users = [
  ana,
  {
    id: "bruno-2",
    name: "Bruno",
    email: "bruno@example.com",
    apartment: "202",
    block: "B",
    phone: "",
    missingStickers: ["USA 4"],
    duplicateStickers: ["BRA 2", "FWC 3"]
  },
  {
    id: "carla-3",
    name: "Carla",
    email: "carla@example.com",
    apartment: "303",
    block: "A",
    phone: "11999990003",
    missingStickers: ["MEX 1"],
    duplicateStickers: ["ARG 10"]
  }
];

console.log(
  JSON.stringify(
    {
      totalStickers: require("./lib/core").album.meta.totalStickers,
      matches: buildMatchList(ana, users)
    },
    null,
    2
  )
);
