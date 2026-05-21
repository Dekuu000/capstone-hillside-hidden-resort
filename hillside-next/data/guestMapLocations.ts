import type { GuestMapAmenityPin } from "../../packages/shared/src/types";

export const guestMapLocations: GuestMapAmenityPin[] = [
  { id: "lobby", name: "Lobby", description: "Front desk and guest assistance.", x: 15, y: 14, kind: "facility" },
  { id: "pool", name: "Main Pool", description: "Infinity pool and lounge area.", x: 58, y: 20, kind: "facility" },
  { id: "spa", name: "Spa Pavilion", description: "Massage, wellness, and relaxation rooms.", x: 74, y: 30, kind: "facility" },
  { id: "cottages", name: "Cottage Zone", description: "Family cottages and grilling area.", x: 35, y: 50, kind: "facility" },
  { id: "garden", name: "Hidden Garden", description: "Quiet garden path with scenic seating.", x: 53, y: 43, kind: "trail" },
  { id: "tour", name: "Tour Meet Point", description: "Day/night tour assembly point.", x: 71, y: 58, kind: "trail" },
  { id: "viewdeck", name: "Hillside View Deck", description: "Sunset viewpoint over the resort trails.", x: 83, y: 48, kind: "trail" },
  { id: "hall", name: "Function Hall", description: "Events and private bookings.", x: 21, y: 72, kind: "facility" },
  { id: "kiosk", name: "Trail Kiosk", description: "Trail guide stop and amenity map board.", x: 46, y: 70, kind: "trail" },
];

