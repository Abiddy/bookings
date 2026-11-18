/* Marée catalog: categories, options and the questions each request form asks.
   Shared by the browser (window.MAREE_CATALOG) and the server (require).
   Prices are typical ranges shown to guests; vendors send the real quote in chat.
   Photos are free under the Unsplash License (https://unsplash.com/license). Swap in partners' own photos later. */
(function (root) {
"use strict";

const U = (id) => "https://images.unsplash.com/photo-" + id;
const P = {
  mdr:      ["1649305115865-e1d7381c55dc", "Edwen Lopez"],
  sail:     ["1586763209375-11dd70fcdc47", "Mads Schmidt Rasmussen"],
  sailDock: ["1569150159137-fec7ce0a077d", "Moritz Kindler"],
  boatDusk: ["1603662423580-2148984328de", "Rafael Garcin"],
  yacht:    ["1736299297925-da1c8b1e2072", "Cemrecan Yurtman"],
  whale:    ["1602265133556-dcc08d51340c", "Mike Doherty"],
  sup:      ["1526188717906-ab4a2f949f26", "Matt Zhou"],
  sup2:     ["1639107835059-31d3591dcdcc", "Manoj Seenivasan"],
  kayak:    ["1586074788305-3f92fa6b034d", "Derek Baumgartner"],
  surf:     ["1713792003769-d87da4e9b706", "Julia Solonina"],
  ride:     ["1746260182646-56e2923282ef", "Kaptured by Kasia"],
  strand:   ["1532993134-5a9c16eeaeb5", "Viviana Rishe"],
  cruiser:  ["1661748453006-6d42ef0c59ca", "Marissa & Eric"],
  bikeRail: ["1768325400062-2b63fec226c3", "Margaux Wolf"],
  canals:   ["1689629517939-b49da24704e1", "Jordan Proietti"],
  hollywood:["1766273686827-2d592ec2e566", "Ars M"],
  convert:  ["1463452689123-df7787f34cac", "Christopher Windus"],
  classic:  ["1600382684764-1424d0b1d9ba", "Craig Marolf"],
  suv:      ["1590094585554-ceb424f815cf", "Matthew Harris"],
  picnic:   ["1714773550457-86b582baca90", "Daniel Manta"],
  beachFun: ["1762740479086-058f54289f3f", "Kellen Riggin"],
  couple:   ["1590595154555-863e37234933", "Jacob Heston"],
  walk:     ["1608283041437-a46090409bb2", "Johannes Beilharz"],
  balloons: ["1528741319675-fab004a2248d", "Liana Mikah"],
  bouquet:  ["1567696153798-9111f9cd3d0d", "Carrie Beth Williams"],
  vase:     ["1579711220348-683ae3f36c3f", "Sebastian Coman"],
  window:   ["1667604987970-4bbd6ed51d0d", "Jannik"],
  terrace:  ["1744352029595-28cba50e6fa0", "Meg von Haartman"],
  chef:     ["1528713066454-eb7d78a98ce0", "Kevin McCutcheon"],
  buffet:   ["1742436448781-fe5eb077abd4", "Ezebunwo Omachi"],
  fishing:  ["1551942296-97384c850440", "Richard R"]
};
const ph = (k) => ({ src: U(P[k][0]), by: P[k][1] });

/* Question library. Labels and choice names are translated in i18n.js by key. */
const FIELDS = {
  date:     { type: "date", required: true },
  dates:    { type: "daterange", required: true },
  time:     { type: "chips", choices: ["morning", "afternoon", "sunset", "evening", "flexible"] },
  guests:   { type: "stepper", min: 1, max: 60, def: 2 },
  duration: { type: "chips", choices: ["d2", "d3", "d4", "dday", "unsure"] },
  level:    { type: "chips", choices: ["first", "some", "confident"] },
  pickup:   { type: "chips", choices: ["hotel", "lax", "other"] },
  carType:  { type: "chips", choices: ["convertible", "suv", "luxury", "electric", "any"] },
  occasion: { type: "chips", choices: ["birthday", "anniversary", "proposal", "family", "business", "other"] },
  budget:   { type: "chips", choices: ["b1", "b2", "b3", "b4", "unsure"] },
  qty:      { type: "stepper", min: 1, max: 30, def: 2 },
  delivery: { type: "chips", choices: ["deliver", "shop"] }
};

const CATS = [
  { id: "rentals", name: "Equipment rentals", photo: ph("cruiser"), fields: ["dates", "qty", "delivery", "budget"] },
  { id: "boats", name: "Boats & yachts", photo: ph("sail"), fields: ["date", "time", "guests", "duration", "budget"] },
  { id: "tours", name: "Tours", photo: ph("canals"), fields: ["date", "time", "guests", "budget"] },
  { id: "water", name: "Beach & water", photo: ph("sup"), fields: ["date", "time", "guests", "level", "budget"] },
  { id: "cars", name: "Car rental", photo: ph("convert"), fields: ["dates", "carType", "pickup", "guests", "budget"] },
  { id: "catering", name: "Catering & chefs", photo: ph("chef"), fields: ["date", "time", "guests", "occasion", "budget"] },
  { id: "occasions", name: "Celebrations & flowers", photo: ph("bouquet"), fields: ["date", "occasion", "guests", "budget"] }
];

const OPTIONS = [
  { id: "bike-rental", cat: "rentals", title: "Bikes & e-bikes", from: 35, unit: "day", photos: [ph("cruiser"), ph("bikeRail"), ph("ride")],
    blurb: "Beach cruisers or e-bikes for the beach path to Venice and Santa Monica.",
    incl: ["Helmet and lock", "Delivery available", "Half day, full day or weekly"] },
  { id: "paddleboard-rental", cat: "rentals", title: "Paddleboards", from: 45, unit: "day", photos: [ph("sup2"), ph("sup"), ph("mdr")],
    blurb: "Stand-up paddleboards for the calm water of the marina and Mother's Beach.",
    incl: ["Board, paddle and leash", "Life vest", "Hourly or daily"] },
  { id: "kayak-rental", cat: "rentals", title: "Kayaks", from: 40, unit: "day", photos: [ph("kayak"), ph("sup2"), ph("mdr")],
    blurb: "Single or tandem kayaks to explore the harbor channels at your own pace.",
    incl: ["Kayak and paddles", "Life vests", "Hourly or daily"] },
  { id: "surf-rental", cat: "rentals", title: "Surfboards & wetsuits", from: 30, unit: "day", photos: [ph("surf"), ph("beachFun"), ph("walk")],
    blurb: "Soft-tops for beginners and hard boards for experienced surfers, with wetsuits.",
    incl: ["Board and leash", "Wetsuit", "Daily or weekly"] },
  { id: "beach-gear", cat: "rentals", title: "Beach gear set", from: 40, unit: "day", photos: [ph("beachFun"), ph("picnic"), ph("walk")],
    blurb: "Chairs, umbrella, cooler and beach games, dropped off at the hotel.",
    incl: ["Chairs and umbrella", "Cooler", "Delivered to the hotel"] },

  { id: "sunset-sail", cat: "boats", title: "Sunset harbor sail", from: 85, unit: "person", photos: [ph("sail"), ph("boatDusk"), ph("sailDock")],
    blurb: "A classic sailboat out past the breakwater as the light turns gold over Santa Monica Bay.",
    incl: ["Skipper and crew", "Drinks on board", "About 2 hours"] },
  { id: "private-yacht", cat: "boats", title: "Private yacht charter", from: 1200, unit: "group", photos: [ph("yacht"), ph("mdr"), ph("boatDusk")],
    blurb: "A private motor yacht with captain and host for your group. Cruise the coast toward Malibu.",
    incl: ["Captain and host", "Snacks and sound system", "3 hours or more"] },
  { id: "harbor-boat", cat: "boats", title: "Electric harbor boat", from: 160, unit: "boat", photos: [ph("mdr"), ph("sailDock"), ph("yacht")],
    blurb: "Drive your own quiet electric boat around the inner harbor. No license needed.",
    incl: ["Up to 8 people", "Life jackets", "90 minutes or more"] },
  { id: "whale-watch", cat: "boats", title: "Whale & dolphin watching", from: 65, unit: "person", photos: [ph("whale"), ph("boatDusk"), ph("mdr")],
    blurb: "Head offshore with a naturalist to look for gray whales and dolphin pods.",
    incl: ["Naturalist guide", "Shared boat", "About 2.5 hours"] },
  { id: "fishing", cat: "boats", title: "Sport fishing trip", from: 79, unit: "person", photos: [ph("fishing"), ph("whale"), ph("mdr")],
    blurb: "Half or full day out to the kelp beds for calico bass and rockfish.",
    incl: ["Bait and tackle", "Crew help", "Fish cleaning"] },

  { id: "bike-tour", cat: "tours", title: "Guided bike tour to Venice", from: 69, unit: "person", photos: [ph("ride"), ph("strand"), ph("bikeRail")],
    blurb: "Ride the beach path past the canals, the skate park and Muscle Beach with a local guide.",
    incl: ["Bike or e-bike", "Helmet", "Local guide"] },
  { id: "venice-canals", cat: "tours", title: "Venice canals walk", from: 45, unit: "person", photos: [ph("canals"), ph("strand"), ph("walk")],
    blurb: "A relaxed walking tour of the Venice canals, Abbot Kinney and the boardwalk.",
    incl: ["Local guide", "About 2 hours", "Coffee stop"] },
  { id: "la-highlights", cat: "tours", title: "Hollywood & LA highlights", from: 99, unit: "person", photos: [ph("hollywood"), ph("strand"), ph("convert")],
    blurb: "A driven tour of the Hollywood sign, Sunset Strip, Beverly Hills and Santa Monica.",
    incl: ["Pickup at the hotel", "Driver-guide", "About 5 hours"] },
  { id: "kayak-tour", cat: "tours", title: "Kayak with the sea lions", from: 55, unit: "person", photos: [ph("kayak"), ph("sup2"), ph("mdr")],
    blurb: "A guided paddle through the main channel to where sea lions haul out on the buoys.",
    incl: ["Kayak and gear", "Guide", "About 2 hours"] },

  { id: "sup-lesson", cat: "water", title: "Stand-up paddle lesson", from: 75, unit: "person", photos: [ph("sup"), ph("sup2"), ph("beachFun")],
    blurb: "Learn on the calm water of Mother's Beach, the marina's sheltered lagoon.",
    incl: ["Board and paddle", "Instructor", "90 minutes"] },
  { id: "surf-lesson", cat: "water", title: "Surf lesson", from: 95, unit: "person", photos: [ph("surf"), ph("beachFun"), ph("walk")],
    blurb: "Beginner-friendly lessons at Venice or Santa Monica with a certified coach.",
    incl: ["Board and wetsuit", "Coach", "About 2 hours"] },


  { id: "convertible", cat: "cars", title: "Convertible rental", from: 150, unit: "day", photos: [ph("convert"), ph("classic"), ph("strand")],
    blurb: "Top-down driving on the Pacific Coast Highway. Delivered to the hotel.",
    incl: ["Delivery and pickup", "Insurance options", "Daily or weekly"] },
  { id: "luxury-car", cat: "cars", title: "Luxury & SUV rental", from: 220, unit: "day", photos: [ph("suv"), ph("convert"), ph("classic")],
    blurb: "Premium SUVs and luxury cars for families or a special trip.",
    incl: ["Delivery and pickup", "Child seats on request", "Daily or weekly"] },
  { id: "chauffeur", cat: "cars", title: "Private driver", from: 95, unit: "hour", photos: [ph("suv"), ph("hollywood"), ph("convert")],
    blurb: "A professional driver for airport runs, dinners or a day around LA.",
    incl: ["Airport pickup", "Hourly or by trip", "Sedan or SUV"] },

  { id: "private-chef", cat: "catering", title: "Private chef dinner", from: 150, unit: "person", photos: [ph("chef"), ph("window"), ph("terrace")],
    blurb: "A chef cooks and serves a seasonal menu in your suite or rental.",
    incl: ["Menu planned with you", "Chef and server", "Cleanup"] },
  { id: "event-catering", cat: "catering", title: "Event & party catering", from: 45, unit: "person", photos: [ph("buffet"), ph("chef"), ph("terrace")],
    blurb: "Catering for birthdays, team events and family gatherings, from canapés to full buffets.",
    incl: ["Custom menu", "Staff available", "Setup and cleanup"] },
  { id: "beach-picnic", cat: "catering", title: "Beach picnic", from: 295, unit: "setup", photos: [ph("picnic"), ph("couple"), ph("beachFun")],
    blurb: "A styled picnic on the sand with a grazing board, cushions and candles.",
    incl: ["Styled setup", "Food for your group", "Setup and cleanup"] },

  { id: "proposal", cat: "occasions", title: "Proposal setup", from: 850, unit: "setup", photos: [ph("couple"), ph("picnic"), ph("walk")],
    blurb: "A planner designs the place, flowers and moment, with a hidden photographer.",
    incl: ["Planning call", "Flowers and décor", "Photographer"] },
  { id: "room-celebration", cat: "occasions", title: "Room decoration", from: 225, unit: "room", photos: [ph("balloons"), ph("bouquet"), ph("vase")],
    blurb: "Balloons, petals, a banner and a cake waiting in your room.",
    incl: ["Balloons and petals", "Personal banner", "Cake on request"] },
  { id: "flowers", cat: "occasions", title: "Flower delivery", from: 95, unit: "bouquet", photos: [ph("bouquet"), ph("vase"), ph("balloons")],
    blurb: "Hand-tied seasonal flowers delivered to the hotel.",
    incl: ["Seasonal stems", "Vase included", "Handwritten card"] }
];

const WELCOME = {
  center: ph("mdr"),
  orbit: ["sup", "picnic", "ride", "yacht", "kayak", "bouquet", "beachFun", "whale", "sail", "convert", "couple"].map(ph)
};

const C = { CATS, OPTIONS, FIELDS, WELCOME };
if (typeof module !== "undefined" && module.exports) module.exports = C; else root.MAREE_CATALOG = C;
})(typeof self !== "undefined" ? self : this);
