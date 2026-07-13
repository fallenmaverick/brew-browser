import SwiftUI

/// Bundles (M3) — a browse grid of curated package sets. Each card shows the
/// bundle's icon, name, tagline, a capability-aware readiness pill, and its
/// package makeup; tapping opens `BundleDetailView` in a sheet. Stock
/// `GroupBox` cards in a `LazyVGrid`, matching the Dashboard card style.
public struct BundlesView: View {
    @Bindable var model: AppModel

    /// Card selected for the detail sheet (`BrewBundle` is Identifiable by `id`).
    @State private var selected: BrewBundle?

    private let columns = [GridItem(.adaptive(minimum: 280), spacing: 16)]

    public init(model: AppModel) { self.model = model }

    public var body: some View {
        Group {
            if model.bundles.isEmpty {
                ContentUnavailableView(
                    "No bundles",
                    systemImage: "square.stack.3d.up",
                    description: Text("Curated package sets will appear here.")
                )
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(model.bundles) { bundle in
                            BundleCard(model: model, bundle: bundle)
                                .onTapGesture { selected = bundle }
                        }
                    }
                    .padding(20)
                }
            }
        }
        .sheet(item: $selected) { bundle in
            BundleDetailView(model: model, bundle: bundle)
        }
    }
}

/// One bundle card. Icon + name + tagline + readiness pill + "N formulae · M
/// casks" line. The whole card is the hit target (the grid's `onTapGesture`).
struct BundleCard: View {
    @Bindable var model: AppModel
    let bundle: BrewBundle

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    Image(systemName: bundleSymbol(bundle.icon))
                        .font(.title2)
                        .foregroundStyle(.tint)
                    Spacer(minLength: 8)
                    ReadinessPill(readiness: model.readiness(for: bundle))
                }
                Text(bundle.name).font(.headline)
                Text(bundle.tagline)
                    .font(.callout).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Text(packageSummary(bundle))
                    .font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
            .contentShape(.rect)
        }
    }
}

// MARK: - Shared readiness UI

/// A small capsule tinted by the readiness verdict, with the reason as its
/// tooltip. Shared by the card and the detail header.
struct ReadinessPill: View {
    let readiness: Readiness
    var body: some View {
        Label(readiness.verdict.pillLabel, systemImage: readiness.verdict.symbol)
            .font(.caption.weight(.medium))
            .foregroundStyle(readiness.verdict.tone)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(readiness.verdict.tone.opacity(0.15), in: .capsule)
            .help(readiness.reason)
    }
}

extension ReadinessVerdict {
    /// User-facing pill label. Never a hard block — "Not recommended" is advisory.
    var pillLabel: String {
        switch self {
        case .ready:    return "Ready"
        case .marginal: return "Marginal"
        case .blocked:  return "Not recommended"
        }
    }

    var tone: Color {
        switch self {
        case .ready:    return .green
        case .marginal: return .orange
        case .blocked:  return .red
        }
    }

    var symbol: String {
        switch self {
        case .ready:    return "checkmark.circle.fill"
        case .marginal: return "exclamationmark.triangle.fill"
        case .blocked:  return "xmark.octagon.fill"
        }
    }
}

// MARK: - Helpers

/// Map a recipe `icon` token to an SF Symbol (all system symbols, no assets).
/// Unknown/nil tokens fall back to the section glyph.
func bundleSymbol(_ icon: String?) -> String {
    switch icon {
    case "database":     return "cylinder.split.1x2"
    case "palette":      return "paintpalette"
    case "image":        return "photo"
    case "brain":        return "brain"
    case "clapperboard": return "film"
    case "code":         return "chevron.left.forwardslash.chevron.right"
    default:             return "square.stack.3d.up"
    }
}

/// "N formulae · M casks" summary for a bundle's package makeup (omits a zero
/// side; singular/plural aware).
func packageSummary(_ bundle: BrewBundle) -> String {
    let formulae = bundle.packages.filter { $0.kind != "cask" }.count
    let casks    = bundle.packages.filter { $0.kind == "cask" }.count
    var parts: [String] = []
    if formulae > 0 { parts.append("\(formulae) formula\(formulae == 1 ? "" : "e")") }
    if casks > 0    { parts.append("\(casks) cask\(casks == 1 ? "" : "s")") }
    return parts.joined(separator: " · ")
}
