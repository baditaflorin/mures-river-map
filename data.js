window.MuresData = {
  metadata: {
    muresOsmRelation: 89325,
    muresWikidata: "Q207493",
    muresLengthKm: 789,
    tiszaSegmentKm: 164,
    totalToDanubeKm: 953,
    sourceName: "Izvoru Mureșului / Hășmaș Mountains",
    mouthName: "Mureș-Tisza confluence near Szeged"
  },

  routeSegments: {
    mures: {
      name: "Mureș",
      color: "#087f8c",
      points: [
        [46.628, 25.741],
        [46.660, 25.678],
        [46.717, 25.601],
        [46.824, 25.470],
        [46.925, 25.353],
        [46.948, 25.137],
        [46.940, 24.902],
        [46.776, 24.705],
        [46.546, 24.562],
        [46.492, 24.096],
        [46.377, 23.855],
        [46.310, 23.725],
        [46.066, 23.570],
        [45.940, 23.365],
        [45.870, 22.910],
        [45.940, 22.650],
        [46.018, 22.235],
        [46.090, 21.700],
        [46.176, 21.318],
        [46.133, 20.590],
        [46.214, 20.480],
        [46.252, 20.194]
      ]
    },
    tisza: {
      name: "Tisza continuation",
      color: "#c26d18",
      points: [
        [46.252, 20.194],
        [46.110, 20.148],
        [45.927, 20.090],
        [45.802, 20.126],
        [45.617, 20.047],
        [45.370, 20.160],
        [45.209, 20.276]
      ]
    },
    danube: {
      name: "Danube context",
      color: "#3a67b1",
      points: [
        [45.338, 19.822],
        [45.255, 19.846],
        [45.209, 20.276],
        [44.999, 20.352],
        [44.821, 20.450]
      ]
    }
  },

  journeyStops: [
    {
      name: "Source",
      detail: "Izvoru Mureșului",
      km: 0,
      elevationM: 908,
      coords: [46.628, 25.741]
    },
    {
      name: "Upper gorge",
      detail: "Toplița",
      km: 96,
      elevationM: 660,
      coords: [46.925, 25.353]
    },
    {
      name: "Gurghiu reach",
      detail: "Reghin",
      km: 205,
      elevationM: 368,
      coords: [46.776, 24.705]
    },
    {
      name: "Central basin",
      detail: "Târgu Mureș",
      km: 260,
      elevationM: 320,
      coords: [46.546, 24.562]
    },
    {
      name: "Apuseni tributaries",
      detail: "Luduș / Arieș",
      km: 345,
      elevationM: 275,
      coords: [46.492, 24.096]
    },
    {
      name: "Alba corridor",
      detail: "Alba Iulia",
      km: 482,
      elevationM: 249,
      coords: [46.066, 23.570]
    },
    {
      name: "Hunedoara reach",
      detail: "Deva / Strei",
      km: 590,
      elevationM: 192,
      coords: [45.870, 22.910]
    },
    {
      name: "Lower Mureș",
      detail: "Arad",
      km: 724,
      elevationM: 118,
      coords: [46.176, 21.318]
    },
    {
      name: "Tisza confluence",
      detail: "near Szeged",
      km: 789,
      elevationM: 73,
      coords: [46.252, 20.194]
    },
    {
      name: "Danube confluence",
      detail: "Tisza at Titel",
      km: 953,
      elevationM: 75,
      coords: [45.209, 20.276]
    }
  ],

  majorTributaries: [
    {
      name: "Arieș",
      lengthKm: 166,
      side: "right bank",
      mouth: "near Gura Arieșului",
      qid: "Q660435",
      points: [
        [46.489, 22.815],
        [46.510, 23.050],
        [46.565, 23.340],
        [46.560, 23.785],
        [46.431, 23.977]
      ]
    },
    {
      name: "Târnava Mare",
      lengthKm: 221,
      side: "left bank via Târnava",
      mouth: "joins Târnava near Blaj",
      qid: "Q2448871",
      points: [
        [46.405, 25.300],
        [46.255, 24.890],
        [46.166, 24.350],
        [46.174, 23.916],
        [46.173, 23.730]
      ]
    },
    {
      name: "Târnava Mică",
      lengthKm: 196,
      side: "left bank via Târnava",
      mouth: "joins Târnava near Blaj",
      qid: "Q2448876",
      points: [
        [46.555, 25.065],
        [46.428, 24.688],
        [46.318, 24.302],
        [46.195, 23.910],
        [46.173, 23.730]
      ]
    },
    {
      name: "Târnava",
      lengthKm: 28,
      side: "left bank",
      mouth: "near Mihalț",
      qid: "Q765478",
      points: [
        [46.173, 23.730],
        [46.160, 23.700],
        [46.150, 23.676]
      ]
    },
    {
      name: "Strei",
      lengthKm: 90,
      side: "left bank",
      mouth: "near Simeria",
      qid: "Q838497",
      points: [
        [45.365, 22.855],
        [45.540, 22.910],
        [45.720, 22.987],
        [45.852, 23.052]
      ]
    },
    {
      name: "Sebeș",
      lengthKm: 96,
      side: "left bank",
      mouth: "near Oarda / Alba Iulia",
      qid: "Q831905",
      points: [
        [45.570, 23.560],
        [45.750, 23.585],
        [45.956, 23.570],
        [46.030, 23.565]
      ]
    },
    {
      name: "Niraj",
      lengthKm: 82,
      side: "left bank",
      mouth: "near Ungheni",
      qid: "Q1468823",
      points: [
        [46.538, 25.110],
        [46.475, 24.840],
        [46.466, 24.575],
        [46.469, 24.440]
      ]
    },
    {
      name: "Cerna",
      lengthKm: 73,
      side: "left bank",
      mouth: "near Deva",
      qid: "Q661815",
      points: [
        [45.610, 22.720],
        [45.730, 22.835],
        [45.823, 22.922],
        [45.884, 22.950]
      ]
    },
    {
      name: "Ampoi",
      lengthKm: 60,
      side: "right bank",
      mouth: "Alba Iulia",
      qid: "Q477286",
      points: [
        [46.183, 23.180],
        [46.112, 23.370],
        [46.067, 23.515],
        [46.055, 23.597]
      ]
    },
    {
      name: "Gurghiu",
      lengthKm: 53,
      side: "left bank",
      mouth: "Reghin",
      qid: "Q562495",
      points: [
        [46.872, 25.050],
        [46.812, 24.905],
        [46.768, 24.770],
        [46.774, 24.706]
      ]
    },
    {
      name: "Cugir",
      lengthKm: 54,
      side: "left bank",
      mouth: "near Șibot",
      qid: "Q3003076",
      points: [
        [45.675, 23.435],
        [45.814, 23.360],
        [45.936, 23.345]
      ]
    },
    {
      name: "Geoagiu",
      lengthKm: 48,
      side: "left bank",
      mouth: "near Geoagiu",
      qid: "Q3756673",
      points: [
        [45.835, 23.225],
        [45.915, 23.175],
        [45.940, 23.150]
      ]
    }
  ]
};
