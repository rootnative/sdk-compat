import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { AppBar } from '@rootnative/components/appbar'
import { Button } from '@rootnative/components/button'
import { Checkbox } from '@rootnative/components/checkbox'
import { Chip } from '@rootnative/components/chip'
import { Dialog } from '@rootnative/components/dialog'
import { LoadingIndicator } from '@rootnative/components/loading-indicator'
import { mdiResolver } from '@rootnative/components/mdi'
import { PortalHost } from '@rootnative/components/portal'
import {
  CircularProgress,
  LinearProgress,
} from '@rootnative/components/progress'
import { Slider } from '@rootnative/components/slider'
import { SnackbarProvider } from '@rootnative/components/snackbar'
import { Switch } from '@rootnative/components/switch'
import { TextField } from '@rootnative/components/text-field'
import { Typography } from '@rootnative/components/typography'
import { ThemeProvider, darkTheme, lightTheme } from '@rootnative/core'

/**
 * The one screen of the device app. The device workflow copies it over the
 * App.tsx of a new React Native CLI app, which has no Expo.
 *
 * It has what a bundle can't prove: the theme, the icon font behind
 * `mdiResolver`, animations on the UI thread, a Portal, the safe-area inset
 * and the react-native-svg components. `touch.yaml` finds the switch and the
 * slider by their `testID`, and the other controls by their text.
 */
function Screen() {
  const [on, setOn] = useState(false)
  const [checked, setChecked] = useState(true)
  const [value, setValue] = useState(0.3)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(false)

  return (
    <View style={{ flex: 1 }}>
      <AppBar
        title="RN CLI check"
        insetTop
        actions={[
          {
            icon: 'magnify',
            accessibilityLabel: 'Search',
            onPress: () => setOpen(true),
          },
        ]}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Typography variant="titleMedium">
          No Expo. Switch {on ? 'on' : 'off'}, slider {value.toFixed(2)}
        </Typography>
        <Button
          variant="filled"
          leadingIcon="plus"
          onPress={() => setOpen(true)}
        >
          Open dialog
        </Button>
        <Button variant="outlined" leadingIcon="heart-outline">
          Outlined
        </Button>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <Switch value={on} onValueChange={setOn} testID="switch" />
          <Switch
            value={on}
            onValueChange={setOn}
            selectedIcon="check"
            unselectedIcon="close"
          />
          <Checkbox value={checked} onValueChange={setChecked} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip variant="assist" leadingIcon="calendar">
            Today
          </Chip>
          <Chip
            variant="filter"
            selected={active}
            onPress={() => setActive((v) => !v)}
          >
            Active
          </Chip>
        </View>
        <Slider value={value} onValueChange={setValue} testID="slider" />
        <TextField
          label="Email"
          variant="outlined"
          leadingIcon="magnify"
          value={text}
          onChangeText={setText}
        />
        <LinearProgress progress={value} />
        <LinearProgress />
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <CircularProgress progress={value} />
          <CircularProgress />
          <LoadingIndicator accessibilityLabel="Loading" />
        </View>
      </ScrollView>
      <Dialog visible={open} onDismiss={() => setOpen(false)}>
        <Dialog.Icon icon="alert-circle-outline" />
        <Dialog.Title>Delete file?</Dialog.Title>
        <Dialog.Content>This cannot be undone.</Dialog.Content>
        <Dialog.Actions>
          <Button variant="text" onPress={() => setOpen(false)}>
            Cancel
          </Button>
        </Dialog.Actions>
      </Dialog>
    </View>
  )
}

export default function App() {
  return (
    <ThemeProvider
      theme={{ light: lightTheme, dark: darkTheme }}
      iconResolver={mdiResolver}
    >
      <PortalHost>
        <SnackbarProvider>
          <Screen />
        </SnackbarProvider>
      </PortalHost>
    </ThemeProvider>
  )
}
