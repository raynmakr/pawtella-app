import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Input from '../src/components/Input';
import { pickImageFromCamera } from '../src/utils/pickImage';

export default function ProfileScreen() {
  const [profilePhoto, setProfilePhoto] = useState("https://placedog.net/400/400?random=13");
  const [petName, setPetName] = useState("Luna");
  const [species, setSpecies] = useState("Dog");
  const [birthday, setBirthday] = useState("2020-05-12");
  const [notes, setNotes] = useState("Loves long naps and cheese.");

  const handleChangePhoto = async () => {
    const uri = await pickImageFromCamera();
    if (uri) {
      setProfilePhoto(uri);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Your Pet Profile</Text>

      {/* Profile Photo */}
      <View style={styles.photoContainer}>
        <Image
          source={{ uri: profilePhoto }}
          style={styles.photo}
        />

        <TouchableOpacity style={styles.photoButton} onPress={handleChangePhoto}>
          <Text style={styles.photoButtonText}>Change Photo</Text>
        </TouchableOpacity>
      </View>

      {/* Inputs */}
      <Input label="Pet Name" value={petName} onChangeText={setPetName} />
      <Input label="Species" value={species} onChangeText={setSpecies} />
      <Input label="Birthday" value={birthday} onChangeText={setBirthday} />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline />

{/* Save Button */}
      <TouchableOpacity style={styles.saveButton}>
        <Text style={styles.saveButtonText}>Save</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 20,
  },
  photoContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  photo: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#eee',
  },
  photoButton: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 12,
  },
  photoButtonText: {
    fontWeight: "600",
  },
  saveButton: {
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: "#000",
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});