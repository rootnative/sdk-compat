import { StyleSheet, Text, View } from 'react-native'
import { candidateExports, candidateName } from './candidate'

/**
 * Smallest app that exercises the package under test on the path a consumer
 * uses.
 *
 * The import goes through `./candidate`, which scripts/set-candidate.mjs
 * rewrites per run. Metro bundles only what the entry graph reaches, so a
 * fixture hard-coded to one library would pass vacuously for every other one.
 *
 * Each package resolves by its own export conditions: inertia's `react-native`
 * condition points at TypeScript source, components' points at built `dist`.
 * Bundling this file compiles whichever one is installed and runs the worklets
 * babel plugin over it.
 */
export default function App() {
  return (
    <View style={styles.root}>
      <View style={styles.box}>
        <Text style={styles.label}>sdk-54</Text>
        <Text style={styles.label}>{candidateName}</Text>
        <Text style={styles.label}>{candidateExports.length} exports</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  box: { padding: 24, borderRadius: 12, backgroundColor: '#4f46e5' },
  label: { color: '#ffffff', fontSize: 16 },
})
