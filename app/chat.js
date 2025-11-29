import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function ChatScreen() {
  const [messages, setMessages] = useState([
    {
      id: '1',
      from: 'bot',
      text: "Hey there 👋 I'm Pawtella. Who's the star of your household?"
    }
  ]);

  const [input, setInput] = useState('');
  const listRef = useRef(null);

  const sendMessage = () => {
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      from: 'user',
      text: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // scroll down
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 10);

    // fake AI reply
    setTimeout(() => {
      const botMessage = {
        id: (Date.now() + 1).toString(),
        from: 'bot',
        text: generateReply(userMessage.text),
      };
      setMessages(prev => [...prev, botMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 10);
    }, 400);
  };

  const generateReply = (text) => {
    const lower = text.toLowerCase();

    if (lower.includes("food")) return "Oooo 👀 what does your pet like to munch on?";
    if (lower.includes("groom")) return "A glow-up session? Love it. How often do you groom them?";
    if (lower.includes("subscription")) return "Subscriptions are coming soon! What would you want included?";

    return "Adorable. Tell me something quirky your pet does 🤭";
  };

  const renderItem = ({ item }) => {
    const isUser = item.from === 'user';

    return (
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.botBubble
        ]}
      >
        <Text style={isUser ? styles.userText : styles.botText}>
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 16 }}
      />

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask Pawtella anything…"
          style={styles.input}
          multiline
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (!input.trim()) return;
            sendMessage();
          }}
        />


        <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 16,
    marginBottom: 10,
  },

  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#000',
  },

  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#eee',
  },

  userText: {
    color: '#fff',
  },

  botText: {
    color: '#000',
  },

  inputRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff'
  },

  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f2f2f2",
    borderRadius: 10,
  },

  sendButton: {
    marginLeft: 10,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  sendText: {
    fontWeight: '700',
  }
});
