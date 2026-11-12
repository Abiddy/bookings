/* Marée catalog: sample experiences to replace with real partners.
   Shared by the browser (window.MAREE_CATALOG) and the server (require), so prices are checked server-side. */
(function (root) {
"use strict";
const CATS = [
  {id:"water", name:"On the water", icon:"sail"},
  {id:"paddle", name:"Paddle & play", icon:"paddle"},
  {id:"coast", name:"Bikes & coast", icon:"bike"},
  {id:"occasion", name:"Celebrations", icon:"ring"},
  {id:"flowers", name:"Flowers & gifts", icon:"flower"},
  {id:"dining", name:"Dining", icon:"glass"}
];
const EXP = [
  {id:"sunset-sail", cat:"water", title:"Sunset harbor sail", motif:"sail", sky:"dusk", price:85, unit:"person", dur:"2 hrs", cap:"Up to 12 guests", times:["sunset-90","sunset-30"], partner:"Sailing charter partner", place:"Main channel dock",
    blurb:"Glide out past the breakwater on a classic sloop as the light turns gold over Santa Monica Bay. Your skipper handles the lines; you handle the view. Blankets are on board for the ride back in, and you're welcome to bring a bottle of your own.",
    incl:["Licensed skipper and crew","Soft drinks and sparkling water","Blankets for the ride back","Bring-your-own wine welcome"], meet:"Main channel guest dock, a 6 minute walk from the lobby",
    addons:[{id:"champ",name:"Bottle of champagne on board",price:85},{id:"photo",name:"Onboard photographer, 30 min",price:150}]},
  {id:"private-yacht", cat:"water", title:"Private yacht charter", motif:"yacht", sky:"day", price:1200, unit:"group", dur:"3 hrs", cap:"Up to 10 guests", times:["11:00 AM","2:00 PM","sunset-120"], partner:"Yacht charter partner", place:"Yacht basin",
    blurb:"A private motor yacht with captain and host. Cruise the coast toward Malibu, drop anchor for a swim when it's warm, and come back to the marina on your own schedule.",
    incl:["Captain and host","Charcuterie and fruit board","Premium sound system","Towels and swim deck"], meet:"Yacht basin, gate assigned at booking",
    addons:[{id:"champ",name:"Two bottles of champagne",price:170},{id:"chef",name:"Chef-prepared lunch",price:320}]},
  {id:"harbor-boat", cat:"water", title:"Electric harbor boat", motif:"duffy", sky:"day", price:160, unit:"boat", dur:"90 min", cap:"Up to 8 guests", times:["10:00 AM","12:00 PM","2:00 PM","sunset-60"], partner:"Harbor boat rental partner", place:"Fisherman's Village",
    blurb:"Captain your own quiet electric boat around the inner harbor. No license needed, just a short walkthrough at the dock. Bring snacks and a playlist.",
    incl:["Safety briefing and life jackets","Bluetooth speaker","Harbor map with sea lion spots","Cooler with ice"], meet:"Fisherman's Village dock",
    addons:[{id:"snack",name:"Snack and drinks basket",price:45}]},
  {id:"whale-watch", cat:"water", title:"Whale & dolphin watch", motif:"whale", sky:"morning", price:65, unit:"person", dur:"2.5 hrs", cap:"Shared boat", times:["9:00 AM","12:30 PM"], partner:"Whale watching partner", place:"Fisherman's Village",
    blurb:"Head offshore with a naturalist to look for gray whales on their winter migration, plus the dolphin pods that run along the coast all year.",
    incl:["Naturalist guide","Indoor and deck seating","Binoculars on loan","Free rebooking if nothing is spotted"], meet:"Fisherman's Village dock", addons:[]},
  {id:"sup-lesson", cat:"paddle", title:"Stand-up paddle lesson", motif:"paddle", sky:"morning", price:75, unit:"person", dur:"90 min", cap:"Up to 6 guests", times:["8:00 AM","10:00 AM","1:00 PM"], partner:"Paddle school partner", place:"Mother's Beach",
    blurb:"Learn on the calm water of Mother's Beach, the marina's sheltered lagoon. Most people are standing within ten minutes.",
    incl:["Board, paddle and leash","Wetsuit if you want one","Certified instructor","Lockers for your things"], meet:"Mother's Beach boathouse",
    addons:[{id:"gopro",name:"GoPro footage of your session",price:35}]},
  {id:"kayak-sealions", cat:"paddle", title:"Kayak with the sea lions", motif:"kayak", sky:"day", price:55, unit:"person", dur:"2 hrs", cap:"Up to 10 guests", times:["9:00 AM","11:30 AM","2:00 PM"], partner:"Paddle school partner", place:"Mother's Beach",
    blurb:"A guided paddle through the main channel to the buoys where sea lions haul out to sun themselves. Tandem kayaks available.",
    incl:["Single or tandem kayak","Guide","Dry bag","Water and snacks"], meet:"Mother's Beach boathouse", addons:[]},
  {id:"coast-ride", cat:"coast", title:"Guided coast ride to Venice", motif:"bike", sky:"day", price:69, unit:"person", dur:"2 hrs", cap:"Up to 8 riders", times:["9:30 AM","1:00 PM","sunset-120"], partner:"Bike tour partner", place:"Hotel entrance",
    blurb:"Ride the beach path past the Venice canals, the skate park and Muscle Beach with a local guide. E-bikes or cruisers, your choice.",
    incl:["E-bike or cruiser","Helmet and lock","Local guide","Coffee stop in Venice"], meet:"Hotel front entrance",
    addons:[{id:"ebike",name:"Upgrade to e-bike",price:20}]},
  {id:"cruiser", cat:"coast", title:"Beach cruiser, half day", motif:"bike", sky:"morning", price:35, unit:"bike", dur:"4 hrs", cap:"Per bike", times:["9:00 AM","1:00 PM"], partner:"Bike rental partner", place:"Delivered to lobby",
    blurb:"A comfortable cruiser delivered to the lobby, ready for an easy ride along the strand to Playa del Rey or Santa Monica.",
    incl:["Cruiser with basket","Helmet and lock","Route card","Delivered to the hotel"], meet:"Delivered to the hotel lobby",
    addons:[{id:"ebike",name:"Make it an e-bike",price:25}]},
  {id:"sunset-picnic", cat:"occasion", title:"Sunset beach picnic", motif:"picnic", sky:"dusk", price:295, unit:"setup for 2", dur:"2 hrs", cap:"For 2", times:["sunset-90"], partner:"Picnic styling partner", place:"Dockweiler Beach",
    blurb:"We set the scene before you arrive: low table, linen, cushions, candles and a grazing board on the sand. You just walk down and sit.",
    incl:["Styled low table and cushions","Grazing board for two","Candles and lanterns","Setup and cleanup"], meet:"Dockweiler Beach, exact spot texted before",
    addons:[{id:"champ",name:"Champagne and flutes",price:85},{id:"roses",name:"Dozen red roses",price:95},{id:"photo",name:"Photographer, 30 min",price:150}]},
  {id:"proposal", cat:"occasion", title:"Proposal setup", motif:"ring", sky:"dusk", price:850, unit:"setup", dur:"Planned with you", cap:"For 2", times:["sunset-60"], partner:"Picnic styling partner", place:"Chosen together",
    blurb:"A planner works with you on the place, the flowers and the moment, then hides a photographer nearby. You only have to ask the question.",
    incl:["Planning call","Floral arch or petal aisle","Hidden photographer, 1 hr","Champagne toast"], meet:"Location chosen together",
    addons:[{id:"violin",name:"Live violinist",price:350}]},
  {id:"room-celebration", cat:"occasion", title:"Room celebration package", motif:"balloon", sky:"night", price:225, unit:"room", dur:"Ready on arrival", cap:"Any occasion", times:["Before 3:00 PM","Before 6:00 PM"], partner:"Event décor partner", place:"Your room",
    blurb:"Balloons, rose petals, a banner and a cake waiting in your room for a birthday or anniversary.",
    incl:["Balloon installation","Petals and candles","Personalized banner","Mini cake from a local bakery"], meet:"Set up in your room",
    addons:[{id:"champ",name:"Champagne on ice",price:85}]},
  {id:"bouquet", cat:"flowers", title:"Seasonal bouquet", motif:"flower", sky:"day", price:95, unit:"bouquet", dur:"Delivered", cap:"To your room", times:["Morning","Afternoon","Evening"], partner:"Florist partner", place:"Your room",
    blurb:"A hand-tied arrangement of what's best at the LA Flower Market this week, wrapped and delivered to your door.",
    incl:["Seasonal stems","Vase included","Handwritten card","Delivery to your room"], meet:"Delivered to your room",
    addons:[{id:"choc",name:"Box of local chocolates",price:30},{id:"large",name:"Make it grand",price:80}]},
  {id:"turndown", cat:"flowers", title:"Rose petal turndown", motif:"ring", sky:"night", price:145, unit:"room", dur:"Evening", cap:"For 2", times:["Evening"], partner:"Florist partner", place:"Your room",
    blurb:"While you're at dinner, we scatter petals, light flameless candles and leave chocolate-dipped strawberries on the nightstand.",
    incl:["Rose petals","Flameless candles","Chocolate-dipped strawberries","Handwritten note"], meet:"Set up in your room",
    addons:[{id:"champ",name:"Champagne on ice",price:85}]},
  {id:"dock-dinner", cat:"dining", title:"Waterfront table for two", motif:"glass", sky:"night", price:40, unit:"booking", dur:"Reservation", cap:"Deposit toward bill", times:["6:00 PM","7:30 PM","9:00 PM"], partner:"Restaurant partner", place:"The promenade",
    blurb:"A window table at a harbor-view restaurant with a welcome glass of sparkling wine. Your deposit comes off the bill.",
    incl:["Reserved window table","Welcome glass of sparkling wine","Deposit applied to your bill","Easy rescheduling"], meet:"A 4 minute walk along the promenade", addons:[]},
  {id:"private-chef", cat:"dining", title:"Private chef on your balcony", motif:"glass", sky:"dusk", price:180, unit:"person", dur:"3 courses", cap:"2 to 6 guests", times:["6:30 PM","7:30 PM"], partner:"Private chef partner", place:"Your suite",
    blurb:"A chef cooks three seasonal courses in your suite and serves them at sunset. Dietary needs handled with a quick call.",
    incl:["Three-course menu","Chef and server","Table setting","Cleanup"], meet:"In your suite",
    addons:[{id:"pair",name:"Wine pairing, per person",price:65}]},
  {id:"fishing", cat:"water", title:"Half-day sport fishing", motif:"fish", sky:"morning", price:79, unit:"person", dur:"5 hrs", cap:"Shared boat", times:["6:00 AM","12:30 PM"], partner:"Sport fishing partner", place:"Fisherman's Village",
    blurb:"Head out to the kelp beds for calico bass and rockfish. Rod rental and a one-day license can be added at the dock.",
    incl:["Bait and tackle","Crew help","Fish cleaning","Galley on board"], meet:"Fisherman's Village landing",
    addons:[{id:"rod",name:"Rod rental",price:15}]}
];

/* Photos: free under the Unsplash License (https://unsplash.com/license), loaded from Unsplash's CDN.
   Each experience: [main photo id, photographer], then extra gallery shots. Swap in partners' own photos later. */
const U = (id) => "https://images.unsplash.com/photo-" + id;
const P = {
  mdr:      ["1649305115865-e1d7381c55dc", "Edwen Lopez"],          // Marina del Rey harbor
  sail:     ["1586763209375-11dd70fcdc47", "Mads Schmidt Rasmussen"],
  sailDock: ["1569150159137-fec7ce0a077d", "Moritz Kindler"],
  boatDusk: ["1603662423580-2148984328de", "Rafael Garcin"],
  yacht:    ["1736299297925-da1c8b1e2072", "Cemrecan Yurtman"],
  whale:    ["1602265133556-dcc08d51340c", "Mike Doherty"],        // Monterey Bay, CA
  sup:      ["1526188717906-ab4a2f949f26", "Matt Zhou"],
  sup2:     ["1639107835059-31d3591dcdcc", "Manoj Seenivasan"],
  kayak:    ["1586074788305-3f92fa6b034d", "Derek Baumgartner"],
  ride:     ["1746260182646-56e2923282ef", "Kaptured by Kasia"],   // Santa Monica, CA
  strand:   ["1532993134-5a9c16eeaeb5", "Viviana Rishe"],          // Santa Monica, CA
  cruiser:  ["1661748453006-6d42ef0c59ca", "Marissa & Eric"],
  bikeRail: ["1768325400062-2b63fec226c3", "Margaux Wolf"],
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
  fishing:  ["1551942296-97384c850440", "Richard R"]
};
const SHOTS = {
  "sunset-sail": ["sail","boatDusk","sailDock","mdr"],
  "private-yacht": ["yacht","mdr","boatDusk","sail"],
  "harbor-boat": ["mdr","sailDock","yacht","boatDusk"],
  "whale-watch": ["whale","boatDusk","mdr","sail"],
  "sup-lesson": ["sup","sup2","kayak","beachFun"],
  "kayak-sealions": ["kayak","sup2","mdr","sup"],
  "coast-ride": ["ride","strand","bikeRail","cruiser"],
  "cruiser": ["cruiser","bikeRail","strand","ride"],
  "sunset-picnic": ["picnic","couple","beachFun","walk"],
  "proposal": ["couple","picnic","walk","bouquet"],
  "room-celebration": ["balloons","bouquet","vase","couple"],
  "bouquet": ["bouquet","vase","balloons","picnic"],
  "turndown": ["vase","bouquet","couple","window"],
  "dock-dinner": ["window","terrace","chef","mdr"],
  "private-chef": ["chef","window","terrace","couple"],
  "fishing": ["fishing","whale","mdr","boatDusk"]
};
EXP.forEach((e) => { e.photos = (SHOTS[e.id] || ["mdr"]).map((k) => ({ src: U(P[k][0]), by: P[k][1] })); });
const WELCOME = {
  center: { src: U(P.mdr[0]), by: P.mdr[1] },
  orbit: ["sup","picnic","ride","yacht","kayak","bouquet","beachFun","whale","sail","strand","couple"].map((k) => ({ src: U(P[k][0]), by: P[k][1] }))
};
const C = { CATS, EXP, WELCOME };
if (typeof module !== "undefined" && module.exports) module.exports = C; else root.MAREE_CATALOG = C;
})(typeof self !== "undefined" ? self : this);
