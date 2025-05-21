import React, { useState, useEffect } from 'react'; // Added useEffect
import { StyleSheet, View, FlatList, SafeAreaView, ActivityIndicator, Alert } from 'react-native'; // Added ActivityIndicator, Alert
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
// Remove mock data imports
// import { mockJourneyHistory, mockFamilyMembers, LocationPoint } from '../data/mockData';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useAuth } from '@/context/AuthContext'; // Import useAuth
import { firestore } from '@/config/firebaseConfig'; // Import firestore
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, orderBy, Timestamp, GeoPoint, limit } from 'firebase/firestore'; // Import firestore functions

// Define the structure for history items fetched from Firestore
interface HistoryItem {
  id: string;
  memberId: string;
  memberName: string;
  location: GeoPoint;
  timestamp: Timestamp;
}

// Define a simpler structure for the member name map
interface MemberInfo {
    name: string;
}

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const styles = createStyles(colorScheme);
  const { user } = useAuth();
  const [historyData, setHistoryData] = useState<HistoryItem[]>([]);
  //const [familyMembersMap, setFamilyMembersMap] = useState<Map<string, MemberInfo>>(new Map());
  const [familyMembersMapState, setFamilyMembersMapState] = useState<Map<string, MemberInfo>>(new Map());


  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      console.log("History: No user logged in.");
      setIsLoading(false);
      setHistoryData([]);
      setFamilyMembersMapState(new Map());
      return;
    }

    setIsLoading(true);
    let unsubscribeHistory: (() => void) | undefined = undefined;

    const fetchHistory = async () => {
      try {
        // 1. Get User's Family ID
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) throw new Error("User document not found");
        const userData = userDocSnap.data();
        const familyId = userData.familyId;

        if (!familyId) {
          console.warn("History: User is not part of a family.");
          // Optionally fetch history just for the current user?
          // For now, just show empty history if no family.
          setHistoryData([]);
          setFamilyMembersMapState(new Map());
          setIsLoading(false);
          return;
        }

        // 2. Get Family Member IDs and Names
        const fetchedMembersMap = new Map<string, MemberInfo>(); // <<< Use local const map
        const membersQuery = query(collection(firestore, 'users'), where("familyId", "==", familyId));
        const membersSnapshot = await getDocs(membersQuery); // Fetch names ONCE
        const memberIds: string[] = [];
        membersSnapshot.forEach((doc) => {
          const memberData = doc.data();
          fetchedMembersMap.set(doc.id, { name: memberData.name || 'Unknown Member' }); // <<< Populate local map
          memberIds.push(doc.id);
        });

        // Update state (optional here, but good practice)
        setFamilyMembersMapState(fetchedMembersMap);

        if (memberIds.length === 0) {
           console.log("History: No members found in the family.");
           setHistoryData([]);
           setIsLoading(false);
           return;
        }

        // 3. Query Location History for those members
        // Note: Firestore 'in' queries are limited to 30 items in the array.
        // If a family can have more members, you'll need multiple queries or a different data structure.
        if (memberIds.length > 30) {
            console.warn("History: Family has more than 30 members, history query might be incomplete.");
            // Handle this limitation (e.g., show warning, query in batches)
        }
        const historyQuery = query(
          collection(firestore, 'locationHistory'),
          where("userId", "in", memberIds.slice(0, 30)),
          orderBy("timestamp", "desc"),
          limit(100)
        );

        // 4. Set up Snapshot Listener
        unsubscribeHistory = onSnapshot(historyQuery, (querySnapshot) => {
          console.log("Processing history snapshot..."); // Add log
          const historyItems: HistoryItem[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            const memberName = fetchedMembersMap.get(data.userId)?.name || 'Unknown Member';

            if (memberName === 'Unknown Member') {
              console.warn(`Could not find name for userId: ${data.userId} in fetched map.`);
          }
            // Type assertion needed as Firestore data is generic
            historyItems.push({
              id: doc.id,
              memberId: data.userId,
              memberName: memberName, // <<< Now uses correct name
              location: data.location as GeoPoint,
              timestamp: data.timestamp as Timestamp,
            });
          });
          setHistoryData(historyItems);
          setIsLoading(false);
        }, (error) => {
          console.error("History: Error fetching location history: ", error);
          Alert.alert("Error", "Could not load location history.");
          setIsLoading(false);
        });

      } catch (error: any) {
        console.error("History: Error setting up history fetch: ", error.message);
        Alert.alert("Error", `Could not load history data: ${error.message}`);
        setIsLoading(false);
      }
    };

    fetchHistory();

    // Cleanup listener on unmount or user change
    return () => {
      if (unsubscribeHistory) {
        console.log("History: Unsubscribing from history listener.");
        unsubscribeHistory();
      }
    };
  }, [user]); // Rerun when user changes

  const renderHistoryItem = ({ item }: { item: HistoryItem }) => {
    // Convert Firestore Timestamp to JS Date for display
    const date = item.timestamp?.toDate();
    const displayTimestamp = date ? date.toLocaleString() : 'No timestamp';

    return (
      <ThemedView style={styles.historyItem}>
        <IconSymbol name="figure.walk" color={Colors[colorScheme ?? 'light'].icon} size={20} style={styles.icon} />
        <View style={styles.historyContent}>
          <ThemedText style={styles.memberName}>{item.memberName}</ThemedText>
          <ThemedText style={styles.locationText}>
            Location: {item.location?.latitude.toFixed(4)}, {item.location?.longitude.toFixed(4)}
          </ThemedText>
          <ThemedText style={styles.timestamp}>{displayTimestamp}</ThemedText>
        </View>
        {/* Optional: Add button to view on map? */}
      </ThemedView>
    );
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText>Loading history...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Journey History</ThemedText>
        <FlatList
          data={historyData}
          renderItem={renderHistoryItem}
          keyExtractor={(item) => item.id} // Use Firestore doc ID as key
          contentContainerStyle={styles.listContentContainer}
          ListEmptyComponent={<ThemedText style={styles.emptyText}>No journey history found for your family.</ThemedText>}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const createStyles = (colorScheme: 'light' | 'dark' | null | undefined) => StyleSheet.create({
  // Add centered and emptyText styles if not already present from previous edits
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors[colorScheme ?? 'light'].background,
  },
  emptyText: {
     textAlign: 'center',
     marginTop: 50,
     fontSize: 16,
     color: Colors[colorScheme ?? 'light'].icon,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors[colorScheme ?? 'light'].background,
  },
  container: {
    flex: 1,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    paddingHorizontal: 16,
    color: Colors[colorScheme ?? 'light'].text,
  },
  listContentContainer: {
    paddingHorizontal: 16,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: Colors[colorScheme ?? 'light'].background,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors[colorScheme ?? 'light'].icon,
  },
  icon: {
    marginRight: 15,
  },
  historyContent: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: Colors[colorScheme ?? 'light'].text,
  },
  locationText: {
     fontSize: 14,
     marginBottom: 4,
     color: Colors[colorScheme ?? 'light'].text,
  },
  timestamp: {
    fontSize: 12,
    color: Colors[colorScheme ?? 'light'].icon,
  },
});
