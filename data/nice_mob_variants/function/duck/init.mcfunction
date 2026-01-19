schedule function nice_mob_variants:duck/init 5s

execute as @e[\
    type=chicken,\
    tag=!nice_mob_variants.duck,\
    predicate=nice_mob_variants:entity/is_duck_variant\
] unless data entity @s data.nice_mob_variants.quack_pitch run function nice_mob_variants:duck/tag/init


execute as @e[\
    type=chicken,\
    tag=nice_mob_variants.duck,\
    predicate=nice_mob_variants:entity/is_duck_variant\
] if data entity @s data.nice_mob_variants.quack_pitch run function nice_mob_variants:duck/play/init with entity @s data.nice_mob_variants