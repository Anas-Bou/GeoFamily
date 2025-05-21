/* eslint-disable max-len */
// functions/src/index.ts

// Import V2 trigger definitions and types
import {
  onValueWritten,
  onValueUpdated,
  DataSnapshot, // Type for RTDB data snapshots
  DatabaseEvent, // Base type for RTDB V2 events
// DatabaseEventContext, // Context type if needed separately
} from "firebase-functions/v2/database";
import {Change} from "firebase-functions"; // <<<<< IMPORT from v1

import * as admin from "firebase-admin";
// eslint-disable-next-line max-len
import {getDatabase} from "firebase-admin/database"; // Admin SDK for RTDB access
// eslint-disable-next-line max-len
import {getFirestore, Timestamp, GeoPoint, FieldValue} from "firebase-admin/firestore"; // Admin SDK for Firestore access

// Initialize Firebase Admin SDK (only once)
admin.initializeApp();
const db = getFirestore(); // Firestore Admin SDK instance
const rtdb = getDatabase(); // Realtime Database Admin SDK instance
const messaging = admin.messaging(); // Messaging Admin SDK instance

// --- Configuration ---
const LOW_BATTERY_THRESHOLD = 20; // Trigger below or equal to this
const NOTIFICATION_COOLDOWN_MS = { // Prevent spamming notifications
  lowBattery: 15 * 60 * 1000, // 15 minutes
  geofence: 5 * 60 * 1000, // 5 minutes per fence per user
};

// --- Types (optional but helpful for clarity) ---
interface UserData {
    name?: string;
    familyId?: string;
    fcmToken?: string;
    role?: string;
}

interface GeofenceData {
    name?: string;
    familyId?: string;
    center?: GeoPoint;
    radius?: number;
}
interface LocationData {
    latitude?: number;
    longitude?: number;
    timestamp?: number | object;
}

interface NotificationCoreData {
    type: "low_battery" | "sos" | "geofence_entry" | "geofence_exit" | "info";
    title: string;
    message: string;
    familyId: string;
    triggeringUid?: string;
    relatedGeofenceId?: string;
    relatedLocation?: GeoPoint | null;
}

/**
 * Sends a push notification via FCM and stores the notification details in Firestore.
 * @param {string} recipientUid The UID of the user receiving the notification.
 * @param {admin.messaging.MessagingPayload} payload The FCM message payload.
 * @param {NotificationCoreData} notificationDbData Core data for the Firestore doc.
 */
async function sendAndStoreNotification(
  recipientUid: string,
  payload: admin.messaging.MessagingPayload,
  notificationDbData: NotificationCoreData,
) {
  try {
    const userDoc = await db.collection("users").doc(recipientUid).get();
    const userData = userDoc.data() as UserData | undefined;
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      console.log(`No FCM token for user ${recipientUid}. Skipping notification.`);
      return;
    }

    const options: admin.messaging.MessagingOptions = {priority: "high"};
    await messaging.sendToDevice(fcmToken, payload, options);
    console.log(`Notification sent via FCM to ${recipientUid}`);

    await db.collection("notifications").add({
      ...notificationDbData,
      recipientUid: recipientUid,
      timestamp: FieldValue.serverTimestamp(),
      read: false,
    });
    console.log(`Notification stored in Firestore for ${recipientUid}, type: ${notificationDbData.type}`);
  } catch (error: any) {
    console.error(`Failed to send/store notification for ${recipientUid}:`, error);
    if (error.code === "messaging/registration-token-not-registered" || error.code === "messaging/invalid-registration-token") {
      console.log(`Detected invalid token for ${recipientUid}. Removing token.`);
      await db.collection("users").doc(recipientUid).update({fcmToken: FieldValue.delete()});
    }
  }
}


// --- 1. Low Battery Function (V2 Syntax) ---
export const checkLowBattery = onValueUpdated( // Use onValueUpdated for changes
  "/liveData/{userId}/batteryLevel", // Path to watch
  async (event: DatabaseEvent<Change<DataSnapshot>>) => { // Add explicit type
    // Use event.params for wildcard values
    const userId = event.params.userId;
    // Use event.data.before and event.data.after for snapshots
    const batteryLevel = event.data.after.val() as number | null;
    const previousBatteryLevel = event.data.before.val() as number | null;

    console.log(`V2 Battery update for ${userId}: ${previousBatteryLevel ?? "null"} -> ${batteryLevel ?? "null"}`);

    if (
      batteryLevel !== null &&
            batteryLevel <= LOW_BATTERY_THRESHOLD &&
            (previousBatteryLevel === null || previousBatteryLevel > LOW_BATTERY_THRESHOLD)
    ) {
      console.log(`V2 Low battery detected for ${userId} (${batteryLevel}%)`);

      // --- Cooldown Check (remains the same logic) ---
      const recentNotifQuery = db.collection("notifications")
        .where("triggeringUid", "==", userId)
        .where("type", "==", "low_battery")
        .orderBy("timestamp", "desc")
        .limit(1);
      const recentNotifSnap = await recentNotifQuery.get();
      if (!recentNotifSnap.empty) {
        const lastNotifTimestamp = recentNotifSnap.docs[0].data().timestamp as Timestamp;
        const cooldownEnd = lastNotifTimestamp.toMillis() + NOTIFICATION_COOLDOWN_MS.lowBattery;
        if (Date.now() < cooldownEnd) {
          console.log(`V2 Low battery notification cooldown active for ${userId}. Skipping.`);
          return; // Exit function
        }
      }
      // --- End Cooldown Check ---

      // --- Fetch User/Family & Send Notifications (remains the same logic) ---
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data() as UserData | undefined;
      if (!userData?.familyId) return; // Exit if no familyId
      const familyId = userData.familyId;
      const userName = userData.name || "A family member";
      const membersSnapshot = await db.collection("users").where("familyId", "==", familyId).get();

      const notificationPayload: admin.messaging.MessagingPayload = {
        notification: {
          title: "Low Battery Alert",
          body: `${userName}'s phone battery is low (${batteryLevel}%).`, // USE userName HERE
          sound: "default",
          tag: `low_battery_${userId}`,
        },
      };
      const notificationDbData: NotificationCoreData = {
        familyId: familyId,
        type: "low_battery", // <-- Already a literal, but 'as const' doesn't hurt
        title: `Low Battery: ${userName}`,
        message: `${userName}'s phone battery is low (${batteryLevel}%).`,
        triggeringUid: userId,
        // relatedLocation, relatedGeofenceId are not applicable here
      };

      const promises = membersSnapshot.docs
        .filter((doc) => doc.id !== userId)
        .map((doc) => sendAndStoreNotification(doc.id, notificationPayload, notificationDbData));
      await Promise.all(promises);
      console.log(`V2 Finished processing low battery for ${userId}.`);
      // --- End Fetch/Send ---
    }
  }
); // Close onValueUpdated


// --- 2. SOS Activation Function (V2 Syntax) ---
export const onSosActivated = onValueWritten(
  "/liveData/{userId}/sosActive",
  async (event: DatabaseEvent<Change<DataSnapshot>>) => {
    if (!event.data.after.exists() || event.data.after.val() !== true) {
      return;
    }

    const userId = event.params.userId;
    console.log(`V2 SOS detected for ${userId}`);
    await event.data.after.ref.set(false); // Reset trigger

    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data() as UserData | undefined;
    if (!userData?.familyId) return;
    const familyId = userData.familyId;
    const userName = userData.name || "A family member";

    // Get current location from RTDB
    const liveDataSnap = await rtdb.ref(`/liveData/${userId}/currentLocation`).get();
    const location = liveDataSnap.val() as LocationData | null;

    // --- MODIFIED LOCATION HANDLING ---
    let locationString = "at their last known location"; // Default string
    let locationGeoPoint: GeoPoint | null = null; // Default GeoPoint

    // Check if location AND both latitude/longitude are valid numbers
    if (location && typeof location.latitude === "number" && typeof location.longitude === "number") {
      locationString = `near ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
      locationGeoPoint = new GeoPoint(location.latitude, location.longitude); // Create GeoPoint only if valid
      console.log(`V2 SOS Location found: ${locationString}`);
    } else {
      console.log(`V2 SOS Location data missing or invalid for ${userId}`);
    }
    // --- END MODIFIED LOCATION HANDLING ---


    // Fetch other members, send notifications
    const membersSnapshot = await db.collection("users").where("familyId", "==", familyId).get();

    const notificationPayload: admin.messaging.MessagingPayload = {
      notification: {
        title: "🆘 SOS Activated!",
        body: `${userName} needs help ${locationString}!`, // Use the determined string
        sound: "default",
      },
    };
    const notificationDbData: NotificationCoreData = {
      familyId: familyId,
      // eslint-disable-next-line indent
        type: "sos", // <-- Already a literal, but 'as const' doesn't hurt
      title: `🆘 SOS: ${userName}`,
      message: `${userName} needs help ${locationString}!`,
      triggeringUid: userId,
      relatedLocation: locationGeoPoint,
    };

    const promises = membersSnapshot.docs
      .filter((doc) => doc.id !== userId)
      .map((doc) => sendAndStoreNotification(doc.id, notificationPayload, notificationDbData));

    await Promise.all(promises);
    console.log(`V2 Finished processing SOS for ${userId}.`);
    return; // Explicit return null if needed by linting rules
  }
);


// --- 3. Geofence Check Function (V2 Syntax) ---
// eslint-disable-next-line require-jsdoc
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // in metres
}

export const checkGeofences = onValueUpdated(
  "/liveData/{userId}/currentLocation",
  async (event: DatabaseEvent<Change<DataSnapshot>>) => {
    const userId = event.params.userId;
    const newLocation = event.data.after.val() as LocationData | null;
    const oldLocation = event.data.before.val() as LocationData | null;

    // --- Location Data Validation ---
    if (
      !newLocation?.latitude || typeof newLocation.latitude !== "number" ||
      !newLocation?.longitude || typeof newLocation.longitude !== "number" ||
      !oldLocation?.latitude || typeof oldLocation.latitude !== "number" ||
      !oldLocation?.longitude || typeof oldLocation.longitude !== "number"
    ) {
      console.log(`V2 Skipping geofence check for ${userId}: invalid/incomplete location data.`);
      return; // Exit early if location data is insufficient
    }
    // --- End Location Validation ---

    // --- Fetch User and Family Info ---
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data() as UserData | undefined;
    if (!userData?.familyId) {
      console.log(`User ${userId} not found or no familyId for geofence check.`);
      return; // Exit if user isn't in a family
    }
    const familyId = userData.familyId;
    const userName = userData.name || "A family member"; // ** USE THIS userName **
    // --- End User/Family Fetch ---

    // --- Fetch Geofences ---
    const geofencesSnapshot = await db.collection("geofences").where("familyId", "==", familyId).get();
    if (geofencesSnapshot.empty) {
      // console.log(`No geofences found for family ${familyId}.`);
      return; // Exit if no fences exist for this family
    }
    // --- End Geofence Fetch ---

    // Fetch family members ONCE, as we might need to notify them for any fence event
    const membersSnapshot = await db.collection("users")
      .where("familyId", "==", familyId).get();

    const notificationPromises: Promise<void>[] = []; // Use Promise<void>

    // --- Iterate Through Geofences ---
    for (const fenceDoc of geofencesSnapshot.docs) {
      const fence = fenceDoc.data() as GeofenceData;
      const fenceId = fenceDoc.id;
      const fenceName = fence.name || "Unnamed Geofence"; // Use fence name

      // --- Geofence Data Validation ---
      if (
        !fence.center?.latitude || typeof fence.center.latitude !== "number" ||
        !fence.center?.longitude || typeof fence.center.longitude !== "number" ||
        !fence.radius || typeof fence.radius !== "number"
      ) {
        console.log(`Skipping invalid geofence ${fenceId}: missing center or radius.`);
        continue; // Skip this fence, check the next one
      }
      // --- End Geofence Validation ---

      // --- Calculate Distances ---
      const distanceOld = getDistance(oldLocation.latitude, oldLocation.longitude, fence.center.latitude, fence.center.longitude);
      const distanceNew = getDistance(newLocation.latitude, newLocation.longitude, fence.center.latitude, fence.center.longitude);
      // --- End Calculate Distances ---

      // --- Determine Geofence Event ---
      const wasInside = distanceOld <= fence.radius;
      const isInside = distanceNew <= fence.radius;
      let eventType: "geofence_entry" | "geofence_exit" | null = null;
      let message = "";

      if (!wasInside && isInside) {
        eventType = "geofence_entry";
        message = `${userName} arrived at ${fenceName}.`; // Use userName and fenceName
        console.log(`User ${userId} entered fence ${fenceId} (${fenceName})`);
      } else if (wasInside && !isInside) {
        eventType = "geofence_exit";
        message = `${userName} left ${fenceName}.`; // Use userName and fenceName
        console.log(`User ${userId} exited fence ${fenceId} (${fenceName})`);
      }
      // --- End Determine Event ---

      // --- Process Event (if occurred) ---
      if (eventType) {
        // --- Cooldown Check ---
        const cooldownQuery = db.collection("notifications")
          .where("triggeringUid", "==", userId)
          .where("relatedGeofenceId", "==", fenceId)
          .where("type", "==", eventType)
          .orderBy("timestamp", "desc")
          .limit(1);
        const cooldownSnap = await cooldownQuery.get();
        if (!cooldownSnap.empty) {
          const lastNotifTimestamp = cooldownSnap.docs[0].data().timestamp as Timestamp;
          const cooldownEnd = lastNotifTimestamp.toMillis() + NOTIFICATION_COOLDOWN_MS.geofence;
          if (Date.now() < cooldownEnd) {
            console.log(`Geofence notification cooldown active for ${userId}, fence ${fenceId}. Skipping.`);
            continue; // Skip this fence if within cooldown
          }
        }
        // --- End Cooldown Check ---

        // --- Prepare Payloads ---
        const notificationPayload: admin.messaging.MessagingPayload = {
          notification: {
            title: fenceName, // Use specific fence name
            body: message, // Use the generated message
            sound: "default",
            tag: `geofence_${userId}_${fenceId}`, // Group notifications
          },
        };
        const notificationDbData: NotificationCoreData = {
          familyId: familyId,
          type: eventType,
          title: fenceName, // Use specific fence name
          message: message, // Use the generated message
          triggeringUid: userId,
          relatedGeofenceId: fenceId,
          // GeoPoint is safe because newLocation validity checked at start
          relatedLocation: new GeoPoint(newLocation.latitude, newLocation.longitude),
        };
        // --- End Prepare Payloads ---

        // --- Send Notifications To Other Members ---
        membersSnapshot.docs
          .filter((doc) => doc.id !== userId) // Don't notify self
          .forEach((memberDoc) => { // Use memberDoc here
            notificationPromises.push(
              // Pass the payloads we just created
              sendAndStoreNotification(memberDoc.id, notificationPayload, notificationDbData)
            );
          });
        // --- End Send Notifications ---
      } // end if(eventType)
    } // end for (const fenceDoc of geofencesSnapshot.docs)
    // --- End Iterate Through Geofences ---

    // Wait for all notification sending/storing promises to settle
    await Promise.all(notificationPromises);
    console.log(`V2 Finished processing geofences for location update of ${userId}.`);
    return null; // Indicate success
  }
);

// --- 4/5. (Optional) HTTPS Callable Functions ---
// If you implement these, use functions.https.onCall as before.
// export const createFamily = functions.https.onCall(async (data, context) => { ... });
// export const joinFamilyByCode = functions.https.onCall(async (data, context) => { ... });
