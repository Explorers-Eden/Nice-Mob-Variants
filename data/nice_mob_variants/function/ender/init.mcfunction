schedule function nice_mob_variants:ender/init 9t

execute as @e[type=#nice_mob_variants:is_data_driven_mob,predicate=nice_mob_variants:entity/is_ender_variant] at @s \
        run function nice_mob_variants:ender/exec