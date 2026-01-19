schedule function nice_mob_variants:ostrich/init 5s

execute as @e[\
    type=chicken,\
    tag=!nice_mob_variants.ostrich,\
    predicate=nice_mob_variants:entity/is_ostrich_variant\
] unless data entity @s data.nice_mob_variants.grunt_pitch run function nice_mob_variants:ostrich/tag/init


execute as @e[\
    type=chicken,\
    tag=nice_mob_variants.ostrich,\
    predicate=nice_mob_variants:entity/is_ostrich_variant\
] if data entity @s data.nice_mob_variants.grunt_pitch run function nice_mob_variants:ostrich/play/init with entity @s data.nice_mob_variants