# typed: false
# frozen_string_literal: true

class Caphlon < Formula
  desc "Unified AI Agent Platform — CLI for Qualixar OS + Open Design + MiMo Code"
  homepage "https://caphlon.dev"
  url "https://github.com/caphlon/caphlon/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args(prefix: false)
    system "npm", "run", "build"
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/caphlon.js" => "caphlon"
    bin.install_symlink libexec/"bin/caphlon.js" => "caph"
  end

  test do
    assert_match "Caphlon", shell_output("#{bin}/caphlon --version")
  end
end
