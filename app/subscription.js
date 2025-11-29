import { useState } from 'react';
import { interpretSubscriptionCommand } from '../src/ai/intent';
import { interpretWithLLM } from '../src/ai/intentLLM';
import inventory from '../src/data/inventory';
import { createSubscriptionEngine } from '../src/state/subscriptionEngine';


import {
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
});


const runAICommand = async (text) => {
  const result = await interpretSubscriptionCommand(text, engine);
  console.log("AI result:", result);
};

const runAIInstruction = async (text) => {
  const parsed = await interpretWithLLM(text, inventory);

  console.log("LLM Parsed:", parsed);

  if (parsed.error) {
    alert(parsed.error);
    return;
  }

  const { action, itemName, frequency } = parsed;

  if (action === "add") {
    engine.addItem({ name: itemName, frequency });
  } else if (action === "remove") {
    engine.removeItem(itemName);
  } else if (action === "update") {
    engine.updateFrequency(itemName, frequency);
  }
};



const frequencies = [
  'Every Week',
  'Every 2 Weeks',
  'Every Month',
  'Every 2 Months'
];

export default function SubscriptionsScreen() {
  const [cart, setCart] = useState([]);
  

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedFrequency, setSelectedFrequency] = useState(null);
  const engine = createSubscriptionEngine(cart, setCart);

  //Test function

const testOpenAI = async () => {
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'it works'." }],
      });

      console.log("OPENAI TEST:", response.choices[0].message.content);
      alert("OpenAI Connected: " + response.choices[0].message.content);

    } catch (err) {
      console.error("OpenAI Error:", err);
      alert("OpenAI FAILED: " + err.message);
    }
  };

  // end Test function


  const openItem = (item) => {
    setSelectedItem(item);
    setSelectedFrequency(null);
  };

  const addToSubscription = () => {
    if (!selectedFrequency) return;

    const entry = {
      ...selectedItem,
      frequency: selectedFrequency
    };

    setCart((prev) => [...prev, entry]);
    setSelectedItem(null);
    setSelectedFrequency(null);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => openItem(item)}>
      <Image source={{ uri: item.image }} style={styles.image} />
      <Text style={styles.itemName}>{item.name}</Text>
      <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>

      <TouchableOpacity //Test Button
        style={{
          padding: 16,
          backgroundColor: '#000',
          borderRadius: 10,
          marginBottom: 20,
        }}
        onPress={testOpenAI}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>
          Test OpenAI
        </Text>
      </TouchableOpacity> 




      <Text style={styles.title}>Build Your Subscription</Text>

      <FlatList
        data={inventory}
        numColumns={2}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      {/* Cart Summary */}
      {cart.length > 0 && (
        <View style={styles.cartBar}>
          <Text style={styles.cartText}>{cart.length} item(s) scheduled</Text>
        </View>
      )}

      {/* Modal for selecting frequency */}
      <Modal visible={!!selectedItem} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedItem && (
              <>
                <Image
                  source={{ uri: selectedItem.image }}
                  style={styles.modalImage}
                />
                <Text style={styles.modalTitle}>{selectedItem.name}</Text>

                <Text style={styles.modalSubtitle}>Select a Frequency:</Text>

                {frequencies.map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.freqButton,
                      selectedFrequency === freq && styles.freqSelected
                    ]}
                    onPress={() => setSelectedFrequency(freq)}
                  >
                    <Text
                      style={[
                        styles.freqText,
                        selectedFrequency === freq && styles.freqTextSelected
                      ]}
                    >
                      {freq}
                    </Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  disabled={!selectedFrequency}
                  style={[
                    styles.addButton,
                    !selectedFrequency && styles.addButtonDisabled
                  ]}
                  onPress={addToSubscription}
                >
                  <Text style={styles.addButtonText}>Add to Subscription</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setSelectedItem(null)}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ padding: 14, backgroundColor: '#000', borderRadius: 12, marginBottom: 10 }}
                  onPress={() => runAIInstruction("add wet food every month")}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
                    Test AI Command
                  </Text>
                </TouchableOpacity>

              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 20 },

  card: {
    flex: 1,
    margin: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    elevation: 2
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 8
  },
  itemName: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  itemPrice: { opacity: 0.7, marginTop: 4 },

  cartBar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: 18,
    backgroundColor: '#000',
    alignItems: 'center'
  },
  cartText: { color: '#fff', fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20
  },
  modalImage: {
    width: 140,
    height: 140,
    alignSelf: 'center',
    borderRadius: 14
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12
  },
  modalSubtitle: {
    marginTop: 20,
    marginBottom: 10,
    fontWeight: '600',
    fontSize: 16
  },

  freqButton: {
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 10
  },
  freqSelected: {
    backgroundColor: '#000',
    borderColor: '#000'
  },
  freqText: { textAlign: 'center', fontSize: 16 },
  freqTextSelected: { color: '#fff', fontWeight: '700' },

  addButton: {
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10
  },
  addButtonDisabled: {
    opacity: 0.4
  },
  addButtonText: { textAlign: 'center', color: '#fff', fontWeight: '700' },

  cancelButton: { paddingVertical: 12 },
  cancelText: { textAlign: 'center', opacity: 0.6 }
});
