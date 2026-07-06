# typed: false
# frozen_string_literal: true

# ŞABLON — henüz yayınlanmış bir release yok. İlk release'te doldurulacaklar:
#   url    → gerçek tag arşivi (git tag v<sürüm> atıldıktan sonra)
#   sha256 → `curl -L <url> | shasum -a 256`
# Not: tarball repo kökünü açar; formül monorepo düzenine göre gözden geçirilmeli.
class Caphlon < Formula
  desc "Unified AI Agent Platform — CLI for Qualixar OS + Open Design + MiMo Code"
  homepage "https://github.com/univerisr-ai/Caphlon"
  url "https://github.com/univerisr-ai/Caphlon/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000" # yayın öncesi doldur
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
