// Stands in for `expo-router`, which the device app doesn't have. One demo
// screen calls `router.back()` from its back buttons, and the device app has
// no route to go back to.
export function useRouter() {
  return {
    back() {},
    push(_href: string) {},
    replace(_href: string) {},
  }
}

export function usePathname() {
  return '/'
}
