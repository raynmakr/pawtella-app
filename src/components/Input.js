import { StyleSheet, Text, TextInput, View } from 'react-native';

export default function Input({ label, value, onChangeText, multiline = false }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
        placeholder={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff'
  },
  multiline: {
    height: 100,
    textAlignVertical: 'top',
  }
});
