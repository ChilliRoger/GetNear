const REPO = "https://github.com/ChilliRoger/GetNear";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40 pb-16 md:pb-0">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-6 text-xs text-muted md:flex-row md:items-center md:justify-between">
        <p>GetNear · testnet-only hackathon prototype · no mainnet funds, no savings claims · MIT license</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a className="hover:text-foreground" href={REPO} target="_blank" rel="noopener noreferrer">
            Source
          </a>
          <a className="hover:text-foreground" href="https://www.ascii-magic.com/ascii" target="_blank" rel="noopener noreferrer">
            ASCII art: ASCII Magic (MIT)
          </a>
          <span>NEAR · Sputnik DAO · 1Click · ECB via Frankfurter</span>
        </p>
      </div>
    </footer>
  );
}
