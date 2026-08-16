"""
ORM rows -> the JSON shape the ported frontend's lib/variants.ts expects.
Must match the prototype's PRODUCTS array shape field-for-field —
see plans/03-backend-fastapi.md §3.
"""
from .models import Product
from .schemas import (
    OptionValueOut,
    ProductOptionOut,
    ProductOut,
    VariantOut,
)


def serialize_product(p: Product) -> ProductOut:
    images: dict[str, list[str]] = {}
    for img in sorted(p.images, key=lambda i: i.position):
        images.setdefault(img.colour_key, []).append(img.url)

    options = [
        ProductOptionOut(
            key=opt.key,
            label=opt.label,
            type=opt.type,
            values=[
                OptionValueOut(
                    id=v.value_id,
                    label=v.label,
                    hex=v.hex,
                    price_delta=v.price_delta,
                )
                for v in sorted(opt.values, key=lambda v: v.position)
            ],
        )
        for opt in sorted(p.options, key=lambda o: o.position)
    ]

    variants = {
        v.variant_key: VariantOut(sku=v.sku, stock=v.stock) for v in p.variants
    }

    return ProductOut(
        id=p.slug,
        name=p.name,
        category=p.category,
        collection=p.collection,
        base_price=p.base_price,
        material=p.material,
        blurb=p.blurb,
        care=list(p.care or []),
        is_featured=p.is_featured,
        images=images,
        options=options,
        variants=variants,
    )
