// src/utils/notifications.ts
import { firestore } from '@/config/firebaseConfig';
import { collection, addDoc, serverTimestamp, GeoPoint, Timestamp, getDocs, query, where } from 'firebase/firestore'; // Added getDocs, query, where

export interface NotificationPayload {
    type: 'sos' | 'low_battery' | 'geofence_entry' | 'geofence_exit' | 'info';
    title: string;
    message: string;
    familyId: string;
    triggeringUid?: string;
    relatedGeofenceId?: string;
    relatedLocation?: { latitude: number; longitude: number } | null;
}

// Fetches non-self member UIDs for a given family
async function getOtherFamilyMemberUids(familyId: string, selfUid: string): Promise<string[]> {
    if (!familyId || !selfUid) return [];
    try {
        const membersQuery = query(collection(firestore, 'users'), where("familyId", "==", familyId));
        const membersSnapshot = await getDocs(membersQuery);
        const uids: string[] = [];
        membersSnapshot.forEach((doc) => {
            if (doc.id !== selfUid) { // Exclude self
                uids.push(doc.id);
            }
        });
        return uids;
    } catch (error) {
        console.error("Error fetching family member UIDs:", error);
        return [];
    }
}


// Creates notification docs for MULTIPLE recipients
export async function createNotificationsForFamily(
    senderUid: string, // UID of the person triggering the event
    payload: NotificationPayload
): Promise<boolean> { // Return true on success, false on failure
    if (!payload.familyId) {
        console.error("Cannot create notifications without familyId");
        return false;
    }
    try {
        // 1. Find other members in the family
        const recipientUids = await getOtherFamilyMemberUids(payload.familyId, senderUid);

        if (recipientUids.length === 0) {
            console.log("No other family members found to notify.");
            return true; // Technically successful, no one to notify
        }

        // 2. Prepare base notification data
        const notificationBaseData: any = {
            familyId: payload.familyId,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            timestamp: serverTimestamp(),
            read: false,
            ...(payload.triggeringUid && { triggeringUid: payload.triggeringUid }),
            ...(payload.relatedGeofenceId && { relatedGeofenceId: payload.relatedGeofenceId }),
            ...(payload.relatedLocation && {
                relatedLocation: new GeoPoint(payload.relatedLocation.latitude, payload.relatedLocation.longitude)
            }),
        };

        // 3. Create a notification document for each recipient
        const promises = recipientUids.map(recipientUid => {
            const notificationData = {
                ...notificationBaseData,
                recipientUid: recipientUid, // Set the specific recipient
            };
            return addDoc(collection(firestore, "notifications"), notificationData);
        });

        await Promise.all(promises);
        console.log(`Notifications stored for ${recipientUids.length} members, type: ${payload.type}`);
        return true;

    } catch (error) {
        console.error(`Error storing family notifications:`, error);
        return false;
    }
}