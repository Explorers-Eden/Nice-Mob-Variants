schedule function nice_mob_variants:rooster/init 6s

execute as @e[type=chicken] at @s \
    unless data entity @s data.nice_mob_variants{has_crowd: 1b} \
    if data entity @s {variant:"nice_mob_variants:rooster"} \
    if predicate nice_mob_variants:time/valid_for_rooster_sound \
        run function nice_mob_variants:rooster/get_data



execute as @e[type=chicken] \
    if data entity @s data.nice_mob_variants{has_crowd: 1b} \
    if data entity @s {variant:"nice_mob_variants:rooster"} \
    unless predicate nice_mob_variants:time/valid_for_rooster_sound \
        run data modify entity @s data.nice_mob_variants.has_crowd set value 0b