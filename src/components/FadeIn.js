import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Animated } from 'react-native';

const FadeIn = forwardRef(({ children, duration = 300, style }, ref) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    trigger() {
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        useNativeDriver: false,
      }).start();
    }
  }));

  return (
    <Animated.View style={[style, { opacity }]}>
      {children}
    </Animated.View>
  );
});

export default FadeIn;
