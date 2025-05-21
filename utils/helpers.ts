// src/utils/helpers.ts

// Simple random code generator (adjust length/characters as needed)
export function generateInviteCode(length: number = 6): string {
    // ... (generateInviteCode function remains the same) ...
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }
  
  // Function to check if an invite code already exists
  // Import Firestore functions and the *initialized* firestore instance
  import { collection, query, where, getDocs } from 'firebase/firestore'; // Keep function imports
  import { firestore } from '@/config/firebaseConfig'; // <--- CORRECT: Import the initialized instance
  
  export async function isInviteCodeUnique(code: string): Promise<boolean> {
      try {
          // Use the imported 'firestore' instance here
          const q = query(collection(firestore, "families"), where("inviteCode", "==", code));
          const querySnapshot = await getDocs(q);
          return querySnapshot.empty; // True if no documents found with this code
      } catch (error) {
          console.error("Error checking invite code uniqueness:", error);
          return false; // Assume not unique on error to be safe
      }
  }

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180; const Δφ = (lat2 - lat1) * Math.PI / 180; const Δλ = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
}
