schedule function nice_mob_variants:rooster/init 6s

execute as @e[type=chicken,predicate=nice_mob_variants:entity/is_rooster_variant,tag=!nice_mob_variants.rooster.has_crowd] at @s \
    if predicate nice_mob_variants:time/valid_for_rooster_sound \
        run function nice_mob_variants:rooster/get_data



execute as @e[type=chicken,predicate=nice_mob_variants:entity/is_rooster_variant] \
    unless predicate nice_mob_variants:time/valid_for_rooster_sound \
        run tag @s remove nice_mob_variants.rooster.has_crowd