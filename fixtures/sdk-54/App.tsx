import { StyleSheet, Text, View } from 'react-native'
import { Motion } from '@rootnative/inertia'

/**
 * Smallest app that exercises the library on the path a consumer uses.
 *
 * Metro resolves `@rootnative/inertia` through its `react-native` export
 * condition, which points at TypeScript source. Bundling this file therefore
 * compiles the library itself, runs the worklets babel plugin over it, and
 * fails when either is broken for this SDK.
 */
export default function App() {
  return (
    <View style={styles.root}>
      <Motion.View
        initial={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{
          opacity: { type: 'timing', duration: 200 },
          translateY: { type: 'spring', tension: 180, friction: 12 },
        }}
        style={styles.box}
      >
        <Text style={styles.label}>sdk-54</Text>
      </Motion.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  box: { padding: 24, borderRadius: 12, backgroundColor: '#4f46e5' },
  label: { color: '#ffffff', fontSize: 16 },
})
