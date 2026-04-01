schedule function nice_mob_variants:sound_variants/init 5s

execute as @e[type=cat,tag=!has_sound,limit=10] run function nice_mob_variants:sound_variants/type/cat
execute as @e[type=cow,tag=!has_sound,limit=10] run function nice_mob_variants:sound_variants/type/cow
execute as @e[type=wolf,tag=!has_sound,limit=10] run function nice_mob_variants:sound_variants/type/wolf
execute as @e[type=pig,tag=!has_sound,limit=10] run function nice_mob_variants:sound_variants/type/pig
execute as @e[type=chicken,tag=!has_sound,limit=10] run function nice_mob_variants:sound_variants/type/chicken