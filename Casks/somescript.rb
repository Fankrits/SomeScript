cask "somescript" do
  version :latest
  sha256 :no_check

  url "https://github.com/Fankrits/SomeScript/releases/latest/download/SomeScript-macos-universal.dmg"
  name "SomeScript"
  desc "Free, local LaTeX editor"
  homepage "https://somescript.com/"

  # :latest is acceptable because SomeScript updates itself via its built-in updater.
  depends_on macos: :monterey

  app "SomeScript.app"

  # Quarantine removal is required while the app is not notarized by Apple.
  # Delete this postflight once the app is signed and notarized with Developer ID.
  # Legacy `postflight` rather than `postflight_steps`: the latter only exists in the newest Homebrew.
  postflight do
    system_command "/usr/bin/xattr",
                   args:         ["-dr", "com.apple.quarantine", "#{appdir}/SomeScript.app"],
                   must_succeed: false
  end

  # Moving this cask to a dedicated 'Fankrits/homebrew-somescript' repository is the upgrade path,
  # allowing users to install via 'brew install --cask Fankrits/somescript/somescript' without an explicit tap URL.
  zap trash: [
    "~/Library/Application Support/com.fankrits.somescript",
    "~/Library/Caches/com.fankrits.somescript",
    "~/Library/Logs/com.fankrits.somescript",
    "~/Library/Preferences/com.fankrits.somescript.plist",
    "~/Library/Saved Application State/com.fankrits.somescript.savedState",
    "~/Library/WebKit/com.fankrits.somescript",
  ]
end
