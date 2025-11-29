import React, { useRef, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import FadeIn from '../src/components/FadeIn';
import { feed as initialFeed } from '../src/data/feed';
import { generateCaptionForImage } from '../src/utils/ai';
import { pickImageFromCamera } from '../src/utils/pickImage';



function FadeInCard({ item, children, cardRefs }) {
  const ref = useRef(null);
  cardRefs.current[item.id] = ref;

  return (
    <FadeIn ref={ref}>
      {children}
    </FadeIn>
  );
}

export default function HomeScreen() {
  const [feed, setFeed] = useState(initialFeed);

  const handleTakePhoto = async () => {
  const uri = await pickImageFromCamera();
  if (!uri) return;

  // Generate an AI caption
  const caption = await generateCaptionForImage(uri);

  const newPost = {
    id: Date.now().toString(),
    petName: "Your Pet",
    caption,
    imageUrl: uri,
    postedAt: "Just now",
  };

  setFeed(prev => [newPost, ...prev]);
};



  // store refs for all cards (persistent per component)
  const cardRefs = useRef({});

  // viewability callback (must be defined inside component)
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach((v) => {
      const ref = cardRefs.current[v.item.id];
      if (ref?.current) {
        ref.current.trigger(); // invoke fade animation
      }
    });
  }).current;

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 40,
  };

  // renderItem contains ZERO hooks now ✔
  const renderItem = ({ item }) => {
    return (
      <FadeInCard item={item} cardRefs={cardRefs}>
        <View style={styles.card}>
          <Image source={{ uri: item.imageUrl }} style={styles.image} />
          <View style={styles.cardBody}>
            <Text style={styles.petName}>{item.petName}</Text>
            <Text style={styles.caption}>{item.caption}</Text>
            <Text style={styles.time}>{item.postedAt}</Text>
          </View>
        </View>
      </FadeInCard>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Pawtella</Text>
      
      <TouchableOpacity style={styles.cameraButton} onPress={handleTakePhoto}>
        <Text style={styles.cameraText}>📷</Text>
      </TouchableOpacity>

      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        contentContainerStyle={{ paddingBottom: 50 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  headerTitle: { fontSize: 28, fontWeight: '700', marginBottom: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  image: { width: '100%', height: 260 },
  cardBody: { padding: 12 },
  petName: { fontSize: 16, fontWeight: '700' },
  caption: { marginTop: 4 },
  time: { marginTop: 4, opacity: 0.6, fontSize: 12 },
  cameraButton: {
  padding: 10,
  borderRadius: 50,
  borderWidth: 1,
  marginLeft: 10,
},
cameraText: {
  fontSize: 20,
},

});


