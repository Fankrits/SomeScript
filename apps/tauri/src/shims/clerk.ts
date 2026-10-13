// Desktop has no accounts. The editor only reads a display name and a token for
// collaboration/Eve, both of which are off, so a fixed local user is enough.
const user = {
  id: "local",
  firstName: "You",
  lastName: "",
  username: "you",
  fullName: "You",
  imageUrl: "",
  primaryEmailAddress: null,
};

export const useUser = () => ({ user, isLoaded: true, isSignedIn: true });

export const useAuth = () => ({
  userId: "local",
  isLoaded: true,
  isSignedIn: true,
  getToken: async (): Promise<string | null> => "local",
});
