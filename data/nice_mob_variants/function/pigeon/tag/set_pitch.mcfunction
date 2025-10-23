execute store result score $pigeon_pitch nice_mob_variants.technical run random value 1..12


execute if score $pigeon_pitch nice_mob_variants.technical matches 1 run return run data modify entity @s data.nice_mob_variants.coo_pitch set value 0.8
execute if score $pigeon_pitch nice_mob_variants.technical matches 2..3 run return run data modify entity @s data.nice_mob_variants.coo_pitch set value 0.9
execute if score $pigeon_pitch nice_mob_variants.technical matches 4..7 run return run data modify entity @s data.nice_mob_variants.coo_pitch set value 1
execute if score $pigeon_pitch nice_mob_variants.technical matches 8..9 run return run data modify entity @s data.nice_mob_variants.coo_pitch set value 1.1
execute if score $pigeon_pitch nice_mob_variants.technical matches 10..11 run return run data modify entity @s data.nice_mob_variants.coo_pitch set value 1.2
execute if score $pigeon_pitch nice_mob_variants.technical matches 12 run return run data modify entity @s data.nice_mob_variants.coo_pitch set value 1.2
