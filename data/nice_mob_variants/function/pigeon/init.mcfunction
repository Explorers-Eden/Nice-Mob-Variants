schedule function nice_mob_variants:pigeon/init 5s

execute as @e[\
    type=chicken,\
    tag=!nice_mob_variants.pigeon,\
    predicate=nice_mob_variants:entity/is_pigeon_variant\
] unless data entity @s data.nice_mob_variants.coo_pitch run function nice_mob_variants:pigeon/tag/init


execute as @e[\
    type=chicken,\
    tag=nice_mob_variants.pigeon,\
    predicate=nice_mob_variants:entity/is_pigeon_variant\
] if data entity @s data.nice_mob_variants.coo_pitch run function nice_mob_variants:pigeon/play/init with entity @s data.nice_mob_variants