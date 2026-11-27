import { PortalHost } from '@rootnative/components/portal'
import { mdiResolver } from '@rootnative/components/mdi'
import { ThemeProvider, darkTheme, lightTheme } from '@rootnative/core'
import { Component, useMemo, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { screens } from './screens.generated'
import TouchScreen from './TouchScreen'

/**
 * The host of the device app. It shows one screen at a time: the touch screen
 * first, then each demo screen of the `ui` example app. `Next` goes to the
 * next one. After the last screen it lists each screen that threw.
 *
 * The bar is plain React Native on purpose. It must work when a component of
 * the library under test doesn't.
 */
type Entry = { name: string; load: () => ComponentType }

const entries: Entry[] = [
  { name: 'touch', load: () => TouchScreen },
  ...screens,
]

class Boundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { message: string | null }
> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error))
  }

  render() {
    if (this.state.message !== null) {
      return (
        <Text style={styles.error}>SCREEN ERROR: {this.state.message}</Text>
      )
    }
    return this.props.children
  }
}

// The require of a screen runs here, in a render, so the boundary also gets
// an error that a screen module throws when it loads.
function Loaded({ entry }: { entry: Entry }) {
  const Screen = useMemo(() => entry.load(), [entry])
  return <Screen />
}

function Host() {
  const insets = useSafeAreaInsets()
  const [index, setIndex] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const entry = entries[index]

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.label}>
          {entry ? `screen: ${entry.name}` : 'screen: summary'}
        </Text>
        <Pressable
          testID="next"
          accessibilityRole="button"
          style={styles.next}
          onPress={() => setIndex((i) => Math.min(i + 1, entries.length))}
        >
          <Text style={styles.nextLabel}>Next</Text>
        </Pressable>
      </View>
      {entry ? (
        <Boundary
          key={entry.name}
          onError={(message) =>
            setErrors((list) => [...list, `${entry.name}: ${message}`])
          }
        >
          <Loaded entry={entry} />
        </Boundary>
      ) : (
        <View style={styles.summary}>
          <Text style={styles.label}>
            {errors.length === 0
              ? `errors: none in ${entries.length} screens`
              : `errors: ${errors.length} of ${entries.length} screens`}
          </Text>
          {errors.map((line) => (
            <Text key={line} style={styles.error}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider
        theme={{ light: lightTheme, dark: darkTheme }}
        iconResolver={mdiResolver}
      >
        <PortalHost>
          <Host />
        </PortalHost>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 4,
    backgroundColor: '#111111',
  },
  label: { color: '#ffffff', fontSize: 14 },
  next: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#444444',
  },
  nextLabel: { color: '#ffffff', fontSize: 14 },
  summary: { flex: 1, padding: 16, gap: 8, backgroundColor: '#111111' },
  error: { color: '#ff6b6b', fontSize: 13, padding: 16 },
})
