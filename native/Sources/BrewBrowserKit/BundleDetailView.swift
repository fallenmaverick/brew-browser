import SwiftUI
import AppKit

/// Bundle detail (M3) — presented as a sheet from `BundlesView`. Shows the
/// capability verdict + reason, each package with its live installed state,
/// caveats, links, and an "Install all" action that streams into Activity via
/// `AppModel.installBundle(_:)`. A `blocked` verdict gates Install behind a
/// confirmation (never a hard block).
struct BundleDetailView: View {
    @Bindable var model: AppModel
    let bundle: BrewBundle

    @Environment(\.dismiss) private var dismiss
    @State private var confirmBlockedInstall = false

    private var readiness: Readiness { model.readiness(for: bundle) }

    /// Packages not yet installed — the set "Install all" would actually add.
    private var pendingCount: Int {
        bundle.packages.filter { !isInstalled($0) }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    verdictCard
                    packagesSection
                    // Caveats sit ABOVE the setup checklist so a heavy bundle's
                    // warning (e.g. Image Gen model downloads) is unmissable.
                    if let caveats = bundle.caveats, !caveats.isEmpty {
                        caveatsCard(caveats)
                    }
                    if let setup = bundle.setup, !setup.isEmpty {
                        setupSection(setup)
                    }
                    if let links = bundle.links, !links.isEmpty {
                        linksSection(links)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider()
            footer
        }
        .frame(width: 520, height: 580)
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: bundleSymbol(bundle.icon))
                .font(.largeTitle)
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 4) {
                Text(bundle.name).font(.title2.weight(.semibold))
                Text(bundle.tagline).font(.callout).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 8) {
                Button("Done") { dismiss() }
                ReadinessPill(readiness: readiness)
            }
        }
        .padding(20)
    }

    // MARK: - Verdict

    private var verdictCard: some View {
        GroupBox {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: readiness.verdict.symbol)
                    .foregroundStyle(readiness.verdict.tone)
                Text(readiness.reason)
                    .font(.callout)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 2)
        } label: {
            Label(readiness.verdict.pillLabel, systemImage: readiness.verdict.symbol)
                .foregroundStyle(readiness.verdict.tone)
        }
    }

    // MARK: - Packages

    private var packagesSection: some View {
        GroupBox {
            VStack(spacing: 6) {
                ForEach(bundle.packages, id: \.self) { pkg in
                    let installed = isInstalled(pkg)
                    HStack(spacing: 8) {
                        Image(systemName: installed ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(installed ? .green : .secondary)
                        Text(pkg.name).font(.callout)
                        Text(pkg.kind)
                            .font(.caption).foregroundStyle(.secondary)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.quaternary, in: .capsule)
                        Spacer()
                        Text(installed ? "Installed" : "Not installed")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.top, 2)
        } label: {
            Label("Packages", systemImage: "shippingbox")
        }
    }

    // MARK: - Caveats

    private func caveatsCard(_ caveats: String) -> some View {
        GroupBox {
            Text(caveats)
                .font(.callout)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
                .padding(.top, 2)
        } label: {
            Label("Caveats", systemImage: "exclamationmark.bubble")
                .foregroundStyle(.orange)
        }
    }

    // MARK: - Setup checklist (M4)

    /// Ordered post-install checklist. brew-native steps (service/open/reveal)
    /// get action buttons; `command` steps are COPY-ONLY and marked "you run
    /// this" — the app never executes arbitrary shell (`external:true` contract).
    /// Shown pre- and post-install so the user sees the whole recipe.
    private func setupSection(_ steps: [SetupStep]) -> some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    SetupStepRow(model: model, step: step, number: index + 1)
                    if index < steps.count - 1 { Divider() }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 2)
        } label: {
            Label("Setup", systemImage: "checklist")
        }
    }

    // MARK: - Links

    private func linksSection(_ links: [BundleLink]) -> some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(links, id: \.self) { link in
                    if let url = URL(string: link.url) {
                        Link(destination: url) {
                            Label(link.label, systemImage: "arrow.up.right.square")
                                .font(.callout)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 2)
        } label: {
            Label("Links", systemImage: "link")
        }
    }

    // MARK: - Footer (Install all)

    private var footer: some View {
        HStack {
            Spacer()
            Button {
                if readiness.verdict == .blocked {
                    confirmBlockedInstall = true
                } else {
                    launchInstall()
                }
            } label: {
                Label(installLabel, systemImage: "arrow.down.circle")
            }
            .buttonStyle(.borderedProminent)
            .disabled(pendingCount == 0)
            .confirmationDialog(
                "Your machine may not run this well — install anyway?",
                isPresented: $confirmBlockedInstall,
                titleVisibility: .visible
            ) {
                Button("Install anyway", role: .destructive) { launchInstall() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(readiness.reason)
            }
        }
        .padding(16)
    }

    private var installLabel: String {
        if pendingCount == 0 { return "All installed" }
        return pendingCount == bundle.packages.count
            ? "Install all"
            : "Install \(pendingCount) missing"
    }

    // MARK: - Actions

    private func isInstalled(_ pkg: BundlePackage) -> Bool {
        let kind = InstalledPackage.Kind(rawValue: pkg.kind) ?? .formula
        return model.installedPackageMatching(token: pkg.name, kind: kind) != nil
    }

    /// Kick off the streaming install and close the sheet so the Activity drawer
    /// (auto-opened by `startJob`) is visible.
    private func launchInstall() {
        let b = bundle
        Task { await model.installBundle(b) }
        dismiss()
    }
}

/// One row of the setup checklist. The kind drives the row: brew-native steps
/// (`service`/`open`/`reveal`) get an action button; `command` is copy-only and
/// visibly marked "you run this"; `note` is plain/markdown text. There is NO
/// code path that executes a `command`/external step — that is the automation
/// boundary the recipe contract guarantees.
struct SetupStepRow: View {
    @Bindable var model: AppModel
    let step: SetupStep
    let number: Int

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(number).")
                .font(.callout.monospacedDigit())
                .foregroundStyle(.secondary)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var content: some View {
        switch step.kind {
        case "service": serviceRow
        case "open":    openRow
        case "reveal":  revealRow
        case "command": commandRow
        case "note":    noteRow
        default:        noteRow   // unknown kind → show its text/label, no action
        }
    }

    // MARK: service → "Start" (disabled until the package is installed)

    private var serviceRow: some View {
        let service = step.service ?? ""
        // brew services are formulae — best-effort installed check.
        let installed = !service.isEmpty
            && model.installedPackageMatching(token: service, kind: .formula) != nil
        return HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(step.label ?? "Start \(service)").font(.callout)
                if !installed {
                    Text("Install this bundle first to start \(service.isEmpty ? "the service" : service).")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            Button("Start") {
                Task { await model.performServiceAction(.start, name: service) }
            }
            .disabled(!installed)
            .help(installed ? "brew services start \(service)"
                            : "The service's package isn't installed yet.")
        }
    }

    // MARK: open → "Open" (http/https only)

    private var openRow: some View {
        let url = validHttpURL(step.url)
        return HStack(alignment: .top, spacing: 8) {
            Text(step.label ?? "Open \(step.url ?? "")").font(.callout)
            Spacer(minLength: 8)
            Button("Open") { if let url { NSWorkspace.shared.open(url) } }
                .disabled(url == nil)
                .help(step.url ?? "")
        }
    }

    // MARK: reveal → "Reveal" in Finder

    private var revealRow: some View {
        let path = step.path ?? ""
        return HStack(alignment: .top, spacing: 8) {
            Text(step.label ?? "Reveal \(path)").font(.callout)
            Spacer(minLength: 8)
            Button("Reveal") {
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
            }
            .disabled(path.isEmpty)
            .help(path)
        }
    }

    // MARK: command → COPY-ONLY, "you run this" (never executed)

    private var commandRow: some View {
        let run = step.run ?? ""
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 8) {
                if let label = step.label { Text(label).font(.callout) }
                Spacer(minLength: 8)
                // A copy affordance only — deliberately NOT a run/execute button.
                Label("you run this", systemImage: "hand.raised")
                    .font(.caption).foregroundStyle(.secondary)
                Button {
                    let pb = NSPasteboard.general
                    pb.clearContents()
                    pb.setString(run, forType: .string)
                    model.pushToast(.success, "Copied")
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                .disabled(run.isEmpty)
            }
            Text(run)
                .font(.callout.monospaced())
                .textSelection(.enabled)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary, in: .rect(cornerRadius: 6))
        }
    }

    // MARK: note → text (markdown if it parses)

    private var noteRow: some View {
        noteText(step.text ?? step.label ?? "")
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
    }

    // MARK: helpers

    /// Render a note as inline markdown when it parses, else as plain text.
    private func noteText(_ s: String) -> Text {
        if let attributed = try? AttributedString(
            markdown: s,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) {
            return Text(attributed)
        }
        return Text(s)
    }

    /// Only http/https URLs are openable — the `open`-step allowlist (mirrors the
    /// scheme guard used for cask homepages). Returns nil for anything else.
    private func validHttpURL(_ raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https"
        else { return nil }
        return url
    }
}
