import { StyleSheet, Text, View } from 'react-native';

export default function SubscriptionsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Subscriptions</Text>
      <Text>Prototype plans UI will live here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 8 },
});
