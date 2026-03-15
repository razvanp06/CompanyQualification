"""
CLI runner — test the pipeline without starting the server.

Usage:
  python cli.py "Logistics companies in Romania"
  python cli.py "Public software companies with more than 1000 employees" --top 10
"""

import sys
import os
import json
import argparse

sys.path.insert(0, os.path.dirname(__file__))

from pipeline.qualify import qualify


EXAMPLE_QUERIES = [
    "Logistic companies in Romania",
    "Public software companies with more than 1,000 employees.",
    "Food and beverage manufacturers in France",
    "Companies that could supply packaging materials for a direct-to-consumer cosmetics brand",
    "Construction companies in the United States with revenue over $50 million",
    "Pharmaceutical companies in Switzerland",
    "B2B SaaS companies providing HR solutions in Europe",
    "Clean energy startups founded after 2018 with fewer than 200 employees",
    "Fast-growing fintech companies competing with traditional banks in Europe.",
    "E-commerce companies using Shopify or similar platforms",
    "Renewable energy equipment manufacturers in Scandinavia",
    "Companies that manufacture or supply critical components for electric vehicle battery production",
]


def main():
    parser = argparse.ArgumentParser(description="Company Qualification CLI")
    parser.add_argument("query", nargs="?", help="Search query")
    parser.add_argument("--top", type=int, default=10, help="Number of results")
    parser.add_argument("--all-queries", action="store_true", help="Run all example queries")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    queries = EXAMPLE_QUERIES if args.all_queries else [args.query]

    if not queries[0]:
        parser.print_help()
        sys.exit(1)

    for query in queries:
        print(f"\n{'='*70}")
        print(f"QUERY: {query}")
        print("="*70)

        result = qualify(query, top_n=args.top)

        if args.json:
            print(json.dumps(result, indent=2, default=str))
            continue

        print(f"\nPipeline: {result['total_candidates']} -> "
              f"{result['after_filter1']} (struct) -> "
              f"{result['after_filter2']} (embed) -> "
              f"{len(result['results'])} (final)")

        print(f"\nExtracted intent:")
        intent = result["intent"]
        for k, v in intent.items():
            if k not in ("original_query", "semantic_query") and v is not None:
                print(f"  {k}: {v}")
        print(f"  semantic_query: {intent.get('semantic_query')}")

        print(f"\nTop {len(result['results'])} results:")
        for r in result["results"]:
            addr = r.get("address", {})
            location = f"{addr.get('town', '')}, {addr.get('country_code', '').upper()}".strip(", ")
            emb = r.get("embedding_score", 0)
            llm = r.get("llm_score", 0)
            final = r.get("final_score", 0)
            print(
                f"  #{r['rank']:2d} [{final:.2f}] "
                f"{r.get('operational_name', 'N/A'):<35s} "
                f"| {location:<20s} "
                f"| emb={emb:.2f} llm={llm}"
            )
            if r.get("match_reasons"):
                print(f"       -> {r['match_reasons']}")


if __name__ == "__main__":
    main()
