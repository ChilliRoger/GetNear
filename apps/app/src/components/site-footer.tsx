const REPO = "https://github.com/ChilliRoger/GetNear";

export function SiteFooter() {
  return (
    <footer className="border-t border-dashed border-border-bright bg-background/80 pb-20 md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-[11px] uppercase tracking-[0.14em] text-muted md:grid-cols-3">
        <div>
          <div className="mb-2 font-semibold text-foreground">GetNear</div>
          <p className="normal-case tracking-normal">
            Testnet-only hackathon prototype. No mainnet funds, no savings claims. Mainnet is roadmap, not shipped.
          </p>
        </div>
        <div>
          <div className="mb-2 font-semibold text-foreground">Built with</div>
          <p className="normal-case tracking-normal">
            NEAR · Sputnik DAO · 1Click dry quotes · ECB via Frankfurter · ASCII art by{" "}
            <a className="text-brand hover:underline" href="https://www.ascii-magic.com/ascii" target="_blank" rel="noopener noreferrer">
              ASCII Magic
            </a>{" "}
            (MIT)
          </p>
        </div>
        <div>
          <div className="mb-2 font-semibold text-foreground">Source</div>
          <a className="normal-case tracking-normal text-brand hover:underline" href={REPO} target="_blank" rel="noopener noreferrer">
            github.com/ChilliRoger/GetNear
          </a>
          <p className="mt-1 normal-case tracking-normal">MIT license</p>
        </div>
      </div>
    </footer>
  );
}
